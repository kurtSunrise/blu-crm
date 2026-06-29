"use client";

import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  type ThreadMessageLike,
  useLocalRuntime,
} from "@assistant-ui/react";
import { usePathname, useRouter } from "next/navigation";
import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  type ConfirmationDecision,
  useAiAssistant,
} from "@/components/ai/ai-context";
import { createChatAttachmentAdapter } from "@/components/ai/chat-attachment-adapter";
import { parseStreamLine, type StreamPayload } from "@/lib/ai/stream-protocol";

// Billify's custom ChatModelAdapter pattern: refs carry the live pathname /
// entity / thread / pending-decision so the adapter (created once) never
// closes over stale state. run() is an async generator so text streams into
// the thread as it arrives. A user turn is either a normal message or, when
// the confirmation card recorded a decision, a confirmation round-trip.

interface RequestContext {
  contactId?: string;
  dealId?: string;
  pathname: string;
  threadId: string | null;
}

interface AdapterCallbacks {
  refresh: () => void;
  setOffline: (offline: boolean) => void;
  setPendingConfirmation: (
    pending: {
      input: unknown;
      summary: string;
      toolName: string;
      toolUseId: string;
    } | null
  ) => void;
  setThreadId: (threadId: string | null) => void;
}

type AssistantContentPart =
  | { type: "text"; text: string }
  | { type: "data"; name: string; data: unknown };

const HTTP_UNAUTHORIZED = 401;
const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;

const OFFLINE_MESSAGE =
  "The AI assistant is offline right now. Everything else in Blu CRM keeps working; try the assistant again later.";

// Client-side stall guard. Deliberately longer than the server idle timeout
// (UPSTREAM_IDLE_TIMEOUT_MS) so the server's own retryable error wins first in
// the common case; this only trips when the connection itself goes silent
// (proxy drop, lost network) and no payload — not even a status heartbeat —
// arrives for this long.
const CLIENT_STALL_TIMEOUT_MS = 45_000;
const STALL_MESSAGE = "That took longer than expected. Please try again.";
const THINKING_PLACEHOLDER = "Thinking…";

interface StallWatchdog {
  // (Re)start the countdown; called before the fetch and on every payload.
  arm: () => void;
  clear: () => void;
  // Combined signal: trips on either the user's cancel or a stall.
  signal: AbortSignal;
}

const createStallWatchdog = (userSignal: AbortSignal): StallWatchdog => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    arm: () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => controller.abort(), CLIENT_STALL_TIMEOUT_MS);
    },
    clear: () => {
      if (timer) {
        clearTimeout(timer);
      }
    },
    signal: AbortSignal.any([userSignal, controller.signal]),
  };
};

const extractMessageText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: string }).type === "text"
    )
    .map((part) => part.text)
    .join("\n");
};

// The trimmed text and uploaded attachment ids from the latest user message.
// assistant-ui carries the composer's files on that message; each id is the
// server's chat_attachment id that /api/chat rehydrates for the model.
const lastUserTurn = (
  messages: readonly { role: string; content: unknown; attachments?: unknown }[]
): { attachmentIds: string[]; text: string } => {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const attachments = lastUserMessage?.attachments as
    | { id: string }[]
    | undefined;
  return {
    attachmentIds: attachments?.map((attachment) => attachment.id) ?? [],
    text: extractMessageText(lastUserMessage?.content).trim(),
  };
};

const errorTextForStatus = async (response: Response): Promise<string> => {
  if (response.status === HTTP_UNAUTHORIZED) {
    return "Your session has expired. Sign in again to use the assistant.";
  }
  if (response.status === HTTP_CONFLICT) {
    return "That action was already resolved. Tell me what you'd like to do next.";
  }
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) {
      return payload.error;
    }
  } catch {
    // Non-JSON error body; fall through to the generic message.
  }
  return "The assistant could not be reached. Please try again.";
};

// Async generator over the NDJSON body: yields one decoded payload at a
// time so the adapter can re-yield message snapshots as they arrive.
async function* streamPayloads(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<StreamPayload> {
  const decoder = new TextDecoder();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      pending += decoder.decode();
      break;
    }
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const payload = parseStreamLine(line);
      if (payload) {
        yield payload;
      }
    }
  }
  const tail = parseStreamLine(pending);
  if (tail) {
    yield tail;
  }
}

interface ChatRequestBody {
  attachmentIds?: string[];
  confirmation?: {
    approved: boolean;
    finalInput?: unknown;
    toolUseId: string;
  };
  message?: string;
  pageContext: { contactId?: string; dealId?: string; pathname: string };
  threadId?: string;
}

// Mutable accumulator for one streamed turn. snapshotOf() renders it into the
// content parts assistant-ui expects; a "Thinking…" placeholder stands in only
// while no real text or data has arrived yet.
interface StreamState {
  dataParts: AssistantContentPart[];
  text: string;
  thinking: boolean;
}

const snapshotOf = (state: StreamState): AssistantContentPart[] => {
  const parts: AssistantContentPart[] = [];
  if (state.text.length > 0) {
    parts.push({ text: state.text, type: "text" });
  } else if (state.thinking && state.dataParts.length === 0) {
    parts.push({ text: THINKING_PLACEHOLDER, type: "text" });
  }
  parts.push(...state.dataParts);
  return parts;
};

// Folds one stream payload into state and reports the snapshot to yield, or
// null when the payload only updates side state (thread id, refresh). Kept out
// of run() so the generator stays under the cognitive-complexity limit.
const applyPayload = (
  payload: StreamPayload,
  state: StreamState,
  callbacks: AdapterCallbacks
): AssistantContentPart[] | null => {
  switch (payload.type) {
    case "thread":
      callbacks.setThreadId(payload.threadId);
      return null;
    case "status":
      if (payload.state !== "thinking") {
        state.thinking = false;
        return null;
      }
      if (state.text.length > 0) {
        return null;
      }
      state.thinking = true;
      return snapshotOf(state);
    case "text":
      state.thinking = false;
      state.text += payload.delta;
      return snapshotOf(state);
    case "artifact":
      state.dataParts.push({
        data: payload.data,
        name: payload.artifactType,
        type: "data",
      });
      return snapshotOf(state);
    case "confirmation_request":
      state.dataParts.push({
        data: {
          input: payload.input,
          summary: payload.summary,
          toolName: payload.toolName,
          toolUseId: payload.toolUseId,
        },
        name: "confirmation_request",
        type: "data",
      });
      callbacks.setPendingConfirmation({
        input: payload.input,
        summary: payload.summary,
        toolName: payload.toolName,
        toolUseId: payload.toolUseId,
      });
      return snapshotOf(state);
    case "data_changed":
      callbacks.refresh();
      return null;
    case "error":
      state.text =
        state.text.length > 0
          ? `${state.text}\n\n${payload.message}`
          : payload.message;
      return snapshotOf(state);
    default:
      return null;
  }
};

// The outcome of opening a turn: either a terminal message to show (offline /
// HTTP error / empty body) or the reader to stream. Folding the precondition
// checks here keeps run() under the cognitive-complexity limit.
type TurnStart =
  | { kind: "message"; content: AssistantContentPart[] }
  | { kind: "reader"; reader: ReadableStreamDefaultReader<Uint8Array> };

const startTurn = async (
  response: Response,
  callbacks: AdapterCallbacks
): Promise<TurnStart> => {
  if (response.status === HTTP_SERVICE_UNAVAILABLE) {
    callbacks.setOffline(true);
    return {
      content: [{ text: OFFLINE_MESSAGE, type: "text" }],
      kind: "message",
    };
  }
  if (!response.ok) {
    return {
      content: [{ text: await errorTextForStatus(response), type: "text" }],
      kind: "message",
    };
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      content: [
        { text: "The assistant sent an empty response.", type: "text" },
      ],
      kind: "message",
    };
  }
  callbacks.setOffline(false);
  return { kind: "reader", reader };
};

const GREETING_MESSAGE =
  "Hi! Ask me about the pipeline, a client, or paste an enquiry to capture.";

// Builds the POST body for one turn, or null when the user turn carries no
// text (an empty submit) so run() can answer with the greeting. The decision
// is read and cleared synchronously off the shared ref before any await — the
// confirmation bubble triggered this run, and consuming it late would let the
// server treat the pending write as superseded (the M4 phase-4 race fix).
const buildRequestBody = (
  messages: readonly {
    role: string;
    content: unknown;
    attachments?: unknown;
  }[],
  request: RequestContext,
  decisionRef: MutableRefObject<ConfirmationDecision | null>,
  callbacks: AdapterCallbacks
): ChatRequestBody | null => {
  const body: ChatRequestBody = {
    pageContext: {
      contactId: request.contactId,
      dealId: request.dealId,
      pathname: request.pathname,
    },
    threadId: request.threadId ?? undefined,
  };

  const decision = decisionRef.current;
  if (decision) {
    body.confirmation = decision;
    decisionRef.current = null;
    callbacks.setPendingConfirmation(null);
    return body;
  }

  const { attachmentIds, text } = lastUserTurn(messages);
  if (!text) {
    return null;
  }
  body.message = text;
  if (attachmentIds.length > 0) {
    body.attachmentIds = attachmentIds;
  }
  return body;
};

const createAdapter = (
  requestRef: MutableRefObject<RequestContext>,
  decisionRef: MutableRefObject<ConfirmationDecision | null>,
  callbacksRef: MutableRefObject<AdapterCallbacks>
): ChatModelAdapter => ({
  async *run({ messages, abortSignal }) {
    const body = buildRequestBody(
      messages,
      requestRef.current,
      decisionRef,
      callbacksRef.current
    );
    if (!body) {
      yield { content: [{ text: GREETING_MESSAGE, type: "text" }] };
      return;
    }

    const watchdog = createStallWatchdog(abortSignal);
    const state: StreamState = { dataParts: [], text: "", thinking: false };

    try {
      watchdog.arm();
      const response = await fetch("/api/chat", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: watchdog.signal,
      });

      const start = await startTurn(response, callbacksRef.current);
      if (start.kind === "message") {
        yield { content: start.content as never };
        return;
      }

      for await (const payload of streamPayloads(start.reader)) {
        // Any payload — including a status heartbeat — proves the stream is
        // alive, so reset the stall countdown on every one.
        watchdog.arm();
        const content = applyPayload(payload, state, callbacksRef.current);
        if (content) {
          yield { content: content as never };
        }
      }

      const finalContent = snapshotOf(state);
      yield {
        content: (finalContent.length > 0
          ? finalContent
          : [{ text: "Done.", type: "text" }]) as never,
      };
    } catch {
      // User-initiated cancel: stay silent and let the runtime settle.
      if (abortSignal.aborted) {
        return;
      }
      // Stall abort or network failure: surface a retryable message instead
      // of leaving the composer spinning forever.
      state.thinking = false;
      state.text =
        state.text.length > 0
          ? `${state.text}\n\n${STALL_MESSAGE}`
          : STALL_MESSAGE;
      yield { content: snapshotOf(state) as never };
    } finally {
      watchdog.clear();
    }
  },
});

// initialMessages seeds the runtime with a resumed thread's transcript; the
// host remounts this provider (key) when switching threads, since a
// LocalRuntime reads them once at creation.
export function AiRuntimeProvider({
  children,
  initialMessages,
}: {
  children: ReactNode;
  initialMessages?: ThreadMessageLike[];
}) {
  const {
    decisionRef,
    entity,
    setAttachmentError,
    setOffline,
    setPendingConfirmation,
    setThreadId,
    threadId,
  } = useAiAssistant();
  const pathname = usePathname();
  const router = useRouter();

  const requestRef = useRef<RequestContext>({ pathname, threadId });
  useEffect(() => {
    requestRef.current = {
      contactId: entity?.contactId,
      dealId: entity?.dealId,
      pathname,
      threadId,
    };
  }, [entity, pathname, threadId]);

  const callbacksRef = useRef<AdapterCallbacks>({
    refresh: () => router.refresh(),
    setOffline,
    setPendingConfirmation,
    setThreadId,
  });
  useEffect(() => {
    callbacksRef.current = {
      refresh: () => router.refresh(),
      setOffline,
      setPendingConfirmation,
      setThreadId,
    };
  }, [router, setOffline, setPendingConfirmation, setThreadId]);

  // Created once; refs keep it current (recreating the adapter would reset
  // in-flight streams). decisionRef is the context's stable ref instance.
  const adapter = useMemo(
    () => createAdapter(requestRef, decisionRef, callbacksRef),
    [decisionRef]
  );
  // The attachment adapter reads the live thread id off requestRef and routes
  // upload failures to the composer error line; both refs are stable.
  const attachmentAdapter = useMemo(
    () =>
      createChatAttachmentAdapter({
        getThreadId: () => requestRef.current.threadId,
        onError: (message) => setAttachmentError(message),
      }),
    [setAttachmentError]
  );
  const runtime = useLocalRuntime(adapter, {
    adapters: { attachments: attachmentAdapter },
    initialMessages,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
