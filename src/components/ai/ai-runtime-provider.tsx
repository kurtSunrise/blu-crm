"use client";

import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  type SuggestionAdapter,
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
  type ComposerMention,
  type ConfirmationDecision,
  type PendingConfirmation,
  useAiAssistant,
} from "@/components/ai/ai-context";
import {
  type CitationRef,
  insertBeforeSourcesPart,
  normalizeCitations,
} from "@/components/ai/artifacts/citation-list";
import { createChatAttachmentAdapter } from "@/components/ai/chat-attachment-adapter";
import {
  type ConfirmationItem,
  parseStreamLine,
  type SourceRef,
  type StreamPayload,
} from "@/lib/ai/stream-protocol";

// Billify's custom ChatModelAdapter pattern: refs carry the live pathname /
// entity / thread / pending-decision so the adapter (created once) never
// closes over stale state. run() is an async generator so content streams into
// the thread as it arrives. A user turn is either a normal message, a
// confirmation round-trip (the card recorded decisions), or a regenerate
// (reload with runConfig.custom.regenerate).

interface RequestContext {
  contactId?: string;
  dealId?: string;
  pathname: string;
  threadId: string | null;
  // Uploaded voice-note audio ids staged for the next send (ai-context).
  voiceAttachmentIds: string[];
}

interface AdapterCallbacks {
  // Drops the staged voice notes once a send has consumed them.
  clearVoiceAttachments: () => void;
  refresh: () => void;
  setOffline: (offline: boolean) => void;
  setPendingConfirmation: (pending: PendingConfirmation | null) => void;
  setThreadId: (threadId: string | null) => void;
  // Follow-up prompts stream in before "done"; the suggestion adapter drains
  // them once the run settles.
  stashSuggestions: (prompts: string[]) => void;
}

// Ordered message parts, assistant-ui compatible: text and reasoning stream
// into trailing parts, tool-call parts render as activity chips, and data
// parts carry artifacts/confirmations/sources for DataPartsRenderer.
type AssistantContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: Record<string, never>;
      argsText: string;
      artifact?: { label: string };
      result?: string;
      isError?: boolean;
    }
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
  let bodyError: string | undefined;
  try {
    const payload = (await response.json()) as { error?: string };
    bodyError = payload.error;
  } catch {
    // Non-JSON error body; fall through to the status-based message.
  }
  if (response.status === HTTP_CONFLICT) {
    // 409s carry distinct reasons (already resolved, regenerate refused
    // because the turn made changes); prefer the server's wording.
    return (
      bodyError ??
      "That action was already resolved. Tell me what you'd like to do next."
    );
  }
  return bodyError ?? "The assistant could not be reached. Please try again.";
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
    decisions: { approved: boolean; finalInput?: unknown; toolUseId: string }[];
  };
  editedMessage?: string;
  message?: string;
  pageContext: {
    contactId?: string;
    dealId?: string;
    mentionedContactIds?: string[];
    mentionedDealIds?: string[];
    pathname: string;
  };
  regenerate?: boolean;
  threadId?: string;
}

// Mutable accumulator for one streamed turn. snapshotOf() copies the ordered
// parts for assistant-ui. While `thinking` is true and no part has arrived
// yet, the snapshot is an empty array — the message's own status stays
// "running" for the whole run(), so the UI derives a "thinking" state from
// `status.type === "running" && content.length === 0` rather than a
// placeholder string standing in for real content.
interface StreamState {
  parts: AssistantContentPart[];
  thinking: boolean;
}

// A shallow copy per yield; parts themselves are replaced (never mutated in
// place) on update so assistant-ui's reference-equality memoisation sees
// every change.
const snapshotOf = (state: StreamState): AssistantContentPart[] =>
  state.parts.slice();

// Appends a streamed delta to a trailing part of the same type, or opens a
// new part. Replacing the trailing part object (not mutating it) is what
// keeps previously yielded snapshots stable.
const appendDelta = (
  parts: AssistantContentPart[],
  type: "text" | "reasoning",
  delta: string
): void => {
  const last = parts.at(-1);
  if (last && last.type === type) {
    parts[parts.length - 1] = { ...last, text: last.text + delta };
    return;
  }
  parts.push({ text: delta, type });
};

const appendErrorText = (
  parts: AssistantContentPart[],
  message: string
): void => {
  const last = parts.at(-1);
  if (last && last.type === "text") {
    parts[parts.length - 1] = { ...last, text: `${last.text}\n\n${message}` };
    return;
  }
  parts.push({ text: message, type: "text" });
};

// Stamps a result on any tool-call part still unresolved so no activity chip
// spins forever after the run ends (normally or via the catch path).
const settleToolParts = (state: StreamState): void => {
  state.parts = state.parts.map((part) =>
    part.type === "tool-call" && part.result === undefined
      ? { ...part, result: "done" }
      : part
  );
};

const markToolDone = (
  parts: AssistantContentPart[],
  toolUseId: string,
  isError: boolean
): void => {
  const index = parts.findIndex(
    (part) => part.type === "tool-call" && part.toolCallId === toolUseId
  );
  const part = parts[index];
  if (part?.type !== "tool-call") {
    return;
  }
  parts[index] = { ...part, isError, result: "done" };
};

const sourceKey = (source: SourceRef): string =>
  JSON.stringify([source.docTitle, source.heading ?? ""]);

// Keeps exactly one trailing "sources" data part per message, merging and
// deduplicating attributions across repeated knowledge searches.
const upsertSources = (
  parts: AssistantContentPart[],
  incoming: SourceRef[]
): void => {
  const existingIndex = parts.findIndex(
    (part) => part.type === "data" && part.name === "sources"
  );
  const existing = parts[existingIndex];
  const current =
    existing?.type === "data"
      ? ((existing.data as { sources?: SourceRef[] }).sources ?? [])
      : [];
  if (existingIndex >= 0) {
    parts.splice(existingIndex, 1);
  }
  const seen = new Set<string>();
  const merged: SourceRef[] = [];
  for (const source of [...current, ...incoming]) {
    const key = sourceKey(source);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(source);
    }
  }
  parts.push({ data: { sources: merged }, name: "sources", type: "data" });
};

// Keeps exactly one "citations" data part per message: merge with the
// existing part, dedupe by marker (first payload for a number wins), sort by
// marker. Same merge pattern as upsertSources above. If a flat "sources"
// part already exists the citations part is re-inserted before it, so the
// numbered list always precedes the fallback chips (and upsertSources always
// re-pushes sources to the end, keeping the order stable in both arrival
// orders).
const upsertCitations = (
  parts: AssistantContentPart[],
  incoming: CitationRef[]
): void => {
  const existingIndex = parts.findIndex(
    (part) => part.type === "data" && part.name === "citations"
  );
  const existing = parts[existingIndex];
  const current =
    existing?.type === "data"
      ? ((existing.data as { citations?: CitationRef[] }).citations ?? [])
      : [];
  if (existingIndex >= 0) {
    parts.splice(existingIndex, 1);
  }
  const merged = normalizeCitations([...current, ...incoming]);
  insertBeforeSourcesPart(parts, {
    data: { citations: merged },
    name: "citations",
    type: "data",
  });
};

// Older servers omit items on confirmation_request; wrap the legacy
// single-write fields so the checklist card always receives items.
const confirmationItemsOf = (payload: {
  items?: ConfirmationItem[];
  input: unknown;
  summary: string;
  toolName: string;
  toolUseId: string;
}): ConfirmationItem[] =>
  payload.items && payload.items.length > 0
    ? payload.items
    : [
        {
          input: payload.input,
          summary: payload.summary,
          toolName: payload.toolName,
          toolUseId: payload.toolUseId,
        },
      ];

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
      if (state.parts.length > 0) {
        return null;
      }
      state.thinking = true;
      return snapshotOf(state);
    case "text":
      state.thinking = false;
      appendDelta(state.parts, "text", payload.delta);
      return snapshotOf(state);
    case "reasoning":
      state.thinking = false;
      appendDelta(state.parts, "reasoning", payload.delta);
      return snapshotOf(state);
    case "tool_start":
      state.parts.push({
        args: {},
        argsText: "{}",
        artifact: { label: payload.label },
        toolCallId: payload.toolUseId,
        toolName: payload.toolName,
        type: "tool-call",
      });
      return snapshotOf(state);
    case "tool_done":
      markToolDone(state.parts, payload.toolUseId, payload.isError === true);
      return snapshotOf(state);
    case "artifact":
      state.parts.push({
        data: payload.data,
        name: payload.artifactType,
        type: "data",
      });
      return snapshotOf(state);
    case "confirmation_request": {
      const items = confirmationItemsOf(payload);
      state.parts.push({
        data: { items },
        name: "confirmation_request",
        type: "data",
      });
      callbacks.setPendingConfirmation({ items });
      return snapshotOf(state);
    }
    case "sources":
      upsertSources(state.parts, payload.sources);
      return snapshotOf(state);
    case "citation":
      // The inline " [N]" marker already arrived inside the text deltas;
      // this payload carries the numbered card the marker points at.
      upsertCitations(state.parts, [
        {
          marker: payload.marker,
          snippet: payload.snippet,
          title: payload.title,
        },
      ]);
      return snapshotOf(state);
    case "memory_saved":
      // One chip per payload, in stream order (no merging: each save is its
      // own undoable row).
      state.parts.push({
        data: { content: payload.content, memoryId: payload.memoryId },
        name: "memory_saved",
        type: "data",
      });
      return snapshotOf(state);
    case "suggestions":
      callbacks.stashSuggestions(payload.prompts);
      return null;
    case "data_changed":
      callbacks.refresh();
      return null;
    case "error":
      appendErrorText(state.parts, payload.message);
      if (payload.retryable) {
        state.parts.push({ data: {}, name: "retry_hint", type: "data" });
      }
      return snapshotOf(state);
    case "done":
      // The persisted assistant message id rides the content as an invisible
      // message_meta data part (DataPartsRenderer skips it); the feedback
      // buttons read it to rate this turn. Resume paints the same part from
      // the transcript row id (chat-launcher.tsx).
      if (payload.messageId) {
        state.parts.push({
          data: { messageId: payload.messageId },
          name: "message_meta",
          type: "data",
        });
        return snapshotOf(state);
      }
      return null;
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

// The server caps mention ids at five per kind; enforce the same here.
const MAX_MENTIONS_PER_KIND = 5;

// Resolves the @-mention picks against the outgoing text: an id is only sent
// while its inserted token still appears in the message, so deleting the
// token before sending drops the id. Consuming clears the ref either way;
// picks belong to the message they were made in.
const consumeMentions = (
  mentionsRef: MutableRefObject<ComposerMention[]>,
  text: string
): { contactIds: string[]; dealIds: string[] } => {
  const mentions = mentionsRef.current;
  mentionsRef.current = [];
  const contactIds: string[] = [];
  const dealIds: string[] = [];
  for (const mention of mentions) {
    if (!text.includes(mention.token)) {
      continue;
    }
    const bucket = mention.kind === "deal" ? dealIds : contactIds;
    if (bucket.length < MAX_MENTIONS_PER_KIND && !bucket.includes(mention.id)) {
      bucket.push(mention.id);
    }
  }
  return { contactIds, dealIds };
};

// How the turn was triggered, read off runConfig.custom: a regenerate reload,
// an edit-and-resubmit of the last user turn, or a plain send.
interface TurnKind {
  editedMessage: string | null;
  regenerate: boolean;
}

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
  mentionsRef: MutableRefObject<ComposerMention[]>,
  callbacks: AdapterCallbacks,
  turn: TurnKind
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
    body.confirmation = { decisions: decision.decisions };
    decisionRef.current = null;
    callbacks.setPendingConfirmation(null);
    return body;
  }

  // An edited turn replaces the tail of a persisted thread server-side. An
  // unsaved thread has no persisted turn to replace, so fall through to a
  // plain send (the edited text is already the last user message locally).
  if (turn.editedMessage && request.threadId) {
    body.editedMessage = turn.editedMessage;
    return body;
  }

  // Regenerate re-runs the last exchange server-side; no user turn is
  // appended. An unsaved thread has nothing to re-run, so fall back to a
  // normal send of the last user message.
  if (turn.regenerate && request.threadId) {
    body.regenerate = true;
    return body;
  }

  const { attachmentIds, text } = lastUserTurn(messages);
  if (!text) {
    return null;
  }
  body.message = text;
  const mentions = consumeMentions(mentionsRef, text);
  if (mentions.dealIds.length > 0) {
    body.pageContext.mentionedDealIds = mentions.dealIds;
  }
  if (mentions.contactIds.length > 0) {
    body.pageContext.mentionedContactIds = mentions.contactIds;
  }
  const allAttachmentIds = [...attachmentIds, ...request.voiceAttachmentIds];
  if (request.voiceAttachmentIds.length > 0) {
    callbacks.clearVoiceAttachments();
  }
  if (allAttachmentIds.length > 0) {
    body.attachmentIds = allAttachmentIds;
  }
  return body;
};

const createAdapter = (
  requestRef: MutableRefObject<RequestContext>,
  decisionRef: MutableRefObject<ConfirmationDecision | null>,
  mentionsRef: MutableRefObject<ComposerMention[]>,
  callbacksRef: MutableRefObject<AdapterCallbacks>
): ChatModelAdapter => ({
  async *run({ messages, abortSignal, runConfig }) {
    const custom = runConfig?.custom;
    const turn: TurnKind = {
      editedMessage:
        typeof custom?.editedMessage === "string" &&
        custom.editedMessage.length > 0
          ? custom.editedMessage
          : null,
      regenerate: custom?.regenerate === true,
    };
    const body = buildRequestBody(
      messages,
      requestRef.current,
      decisionRef,
      mentionsRef,
      callbacksRef.current,
      turn
    );
    if (!body) {
      yield { content: [{ text: GREETING_MESSAGE, type: "text" }] };
      return;
    }

    const watchdog = createStallWatchdog(abortSignal);
    const state: StreamState = { parts: [], thinking: false };

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

      settleToolParts(state);
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
      settleToolParts(state);
      appendErrorText(state.parts, STALL_MESSAGE);
      state.parts.push({ data: {}, name: "retry_hint", type: "data" });
      yield { content: snapshotOf(state) as never };
    } finally {
      watchdog.clear();
    }
  },
});

// Drains the prompts stashed by the latest "suggestions" payload once the
// run settles; assistant-ui clears thread.suggestions itself at run start.
const createSuggestionAdapter = (
  promptsRef: MutableRefObject<string[]>
): SuggestionAdapter => ({
  generate: () => {
    const prompts = promptsRef.current;
    promptsRef.current = [];
    return Promise.resolve(prompts.map((prompt) => ({ prompt })));
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
    clearVoiceAttachments,
    decisionRef,
    entity,
    mentionsRef,
    setAttachmentError,
    setOffline,
    setPendingConfirmation,
    setThreadId,
    threadId,
    voiceAttachmentIds,
  } = useAiAssistant();
  const pathname = usePathname();
  const router = useRouter();

  const requestRef = useRef<RequestContext>({
    pathname,
    threadId,
    voiceAttachmentIds: [],
  });
  useEffect(() => {
    requestRef.current = {
      contactId: entity?.contactId,
      dealId: entity?.dealId,
      pathname,
      threadId,
      voiceAttachmentIds,
    };
  }, [entity, pathname, threadId, voiceAttachmentIds]);

  const suggestionPromptsRef = useRef<string[]>([]);

  const callbacksRef = useRef<AdapterCallbacks>({
    clearVoiceAttachments,
    refresh: () => router.refresh(),
    setOffline,
    setPendingConfirmation,
    setThreadId,
    stashSuggestions: (prompts) => {
      suggestionPromptsRef.current = prompts;
    },
  });
  useEffect(() => {
    callbacksRef.current = {
      clearVoiceAttachments,
      refresh: () => router.refresh(),
      setOffline,
      setPendingConfirmation,
      setThreadId,
      stashSuggestions: (prompts) => {
        suggestionPromptsRef.current = prompts;
      },
    };
  }, [
    clearVoiceAttachments,
    router,
    setOffline,
    setPendingConfirmation,
    setThreadId,
  ]);

  // Created once; refs keep it current (recreating the adapter would reset
  // in-flight streams). decisionRef and mentionsRef are the context's stable
  // ref instances.
  const adapter = useMemo(
    () => createAdapter(requestRef, decisionRef, mentionsRef, callbacksRef),
    [decisionRef, mentionsRef]
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
  const suggestionAdapter = useMemo(
    () => createSuggestionAdapter(suggestionPromptsRef),
    []
  );
  const runtime = useLocalRuntime(adapter, {
    adapters: {
      attachments: attachmentAdapter,
      suggestion: suggestionAdapter,
    },
    initialMessages,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
