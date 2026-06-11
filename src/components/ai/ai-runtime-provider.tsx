"use client";

import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  useLocalRuntime,
} from "@assistant-ui/react";
import { usePathname } from "next/navigation";
import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { parseStreamLine, type StreamPayload } from "@/lib/ai/stream-protocol";

// Billify's custom ChatModelAdapter pattern: refs carry the live pathname /
// entity / thread so the adapter (created once) never closes over stale
// state. Unlike Billify, run() is an async generator so text streams into
// the thread as it arrives.

interface RequestContext {
  contactId?: string;
  dealId?: string;
  pathname: string;
  threadId: string | null;
}

interface AdapterCallbacks {
  setOffline: (offline: boolean) => void;
  setThreadId: (threadId: string | null) => void;
}

type AssistantContentPart =
  | { type: "text"; text: string }
  | { type: "data"; name: string; data: unknown };

const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVICE_UNAVAILABLE = 503;

const OFFLINE_MESSAGE =
  "The AI assistant is offline right now. Everything else in Blu CRM keeps working; try the assistant again later.";

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

const errorTextForStatus = async (response: Response): Promise<string> => {
  if (response.status === HTTP_UNAUTHORIZED) {
    return "Your session has expired. Sign in again to use the assistant.";
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

const createAdapter = (
  requestRef: MutableRefObject<RequestContext>,
  callbacksRef: MutableRefObject<AdapterCallbacks>
): ChatModelAdapter => ({
  async *run({ messages, abortSignal }) {
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const messageText = extractMessageText(lastUserMessage?.content).trim();
    if (!messageText) {
      yield {
        content: [
          {
            text: "Hi! Ask me about the pipeline, a client, or paste an enquiry to capture.",
            type: "text",
          },
        ],
      };
      return;
    }

    const request = requestRef.current;
    const response = await fetch("/api/chat", {
      body: JSON.stringify({
        message: messageText,
        pageContext: {
          contactId: request.contactId,
          dealId: request.dealId,
          pathname: request.pathname,
        },
        threadId: request.threadId ?? undefined,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: abortSignal,
    });

    if (response.status === HTTP_SERVICE_UNAVAILABLE) {
      callbacksRef.current.setOffline(true);
      yield { content: [{ text: OFFLINE_MESSAGE, type: "text" }] };
      return;
    }
    if (!response.ok) {
      yield {
        content: [{ text: await errorTextForStatus(response), type: "text" }],
      };
      return;
    }
    const reader = response.body?.getReader();
    if (!reader) {
      yield {
        content: [
          { text: "The assistant sent an empty response.", type: "text" },
        ],
      };
      return;
    }

    callbacksRef.current.setOffline(false);

    let text = "";
    const dataParts: AssistantContentPart[] = [];
    const snapshot = (): AssistantContentPart[] => {
      const parts: AssistantContentPart[] = [];
      if (text.length > 0) {
        parts.push({ text, type: "text" });
      }
      parts.push(...dataParts);
      return parts;
    };

    for await (const payload of streamPayloads(reader)) {
      switch (payload.type) {
        case "thread":
          callbacksRef.current.setThreadId(payload.threadId);
          break;
        case "text":
          text += payload.delta;
          yield { content: snapshot() as never };
          break;
        case "artifact":
          dataParts.push({
            data: payload.data,
            name: payload.artifactType,
            type: "data",
          });
          yield { content: snapshot() as never };
          break;
        case "error":
          text =
            text.length > 0 ? `${text}\n\n${payload.message}` : payload.message;
          yield { content: snapshot() as never };
          break;
        default:
          break;
      }
    }

    const finalContent = snapshot();
    yield {
      content: (finalContent.length > 0
        ? finalContent
        : [{ text: "Done.", type: "text" }]) as never,
    };
  },
});

export function AiRuntimeProvider({ children }: { children: ReactNode }) {
  const { entity, setOffline, setThreadId, threadId } = useAiAssistant();
  const pathname = usePathname();

  const requestRef = useRef<RequestContext>({ pathname, threadId });
  useEffect(() => {
    requestRef.current = {
      contactId: entity?.contactId,
      dealId: entity?.dealId,
      pathname,
      threadId,
    };
  }, [entity, pathname, threadId]);

  const callbacksRef = useRef<AdapterCallbacks>({ setOffline, setThreadId });
  useEffect(() => {
    callbacksRef.current = { setOffline, setThreadId };
  }, [setOffline, setThreadId]);

  // Created once; refs keep it current (recreating the adapter would reset
  // in-flight streams).
  const adapter = useMemo(() => createAdapter(requestRef, callbacksRef), []);
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
