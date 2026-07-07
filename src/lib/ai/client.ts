import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import type * as Anthropic from "@/lib/ai/anthropic";
import {
  AI_MODEL_KEY,
  DEFAULT_AI_MODEL,
  isKnownAiModel,
} from "@/lib/ai/models";

// Direct REST client for the Anthropic Messages API. We call the HTTP
// endpoint with fetch instead of the official SDK so the SDK stays out of
// the Cloudflare Worker bundle (it pushed the Worker past the 3 MiB limit);
// the SDK's TYPES are still used everywhere via `import type`, which is
// erased at build time and costs no bundle bytes. workerd has a native
// fetch + streaming, so nothing here needs a Node polyfill.

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const ERROR_BODY_MAX = 500;
const TRAILING_SLASH = /\/$/;

// The AI path needs the same abort discipline the DB layer already has
// (src/db/index.ts): without it a stalled upstream stream awaits forever and
// the chat turn hangs. IDLE bounds the gap between stream chunks; OVERALL is a
// hard ceiling on one model call. The idle timer is safe alongside long
// "adaptive" thinking because Anthropic keeps emitting ping/thinking events
// while it reasons, so the gap only grows on a genuine stall. Both are env-
// tunable (defaults below) so they can change without a deploy and so the E2E
// suite can shrink the idle window to exercise the stall path quickly.
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_OVERALL_TIMEOUT_MS = 120_000;
const TIMEOUT_MESSAGE =
  "The assistant took too long to respond and was stopped. Please try again.";

const readTimeoutMs = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const idleTimeoutMs = (): number =>
  readTimeoutMs("AI_IDLE_TIMEOUT_MS", DEFAULT_IDLE_TIMEOUT_MS);
const overallTimeoutMs = (): number =>
  readTimeoutMs("AI_OVERALL_TIMEOUT_MS", DEFAULT_OVERALL_TIMEOUT_MS);

// Stream callbacks: onText forwards visible text deltas; onActivity fires on
// otherwise-silent upstream progress (ping / thinking deltas) so the route can
// keep the client's connection demonstrably alive during the thinking phase;
// onThinking forwards readable thinking-summary deltas for the reasoning UI;
// onCitation fires per citations_delta event so the agent loop can number and
// stream inline citation markers as the cited text arrives.
export interface StreamHandlers {
  onActivity?: () => void;
  onCitation?: (citation: Anthropic.TextCitation) => void;
  onText: (delta: string) => void;
  onThinking?: (delta: string) => void;
}

// The org-wide model choice persisted in app_setting (Settings → AI
// Preferences), or the default when unset or no longer offered.
export const getStoredAiModel = async (): Promise<string> => {
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, AI_MODEL_KEY))
    .limit(1);
  const value = row?.value?.trim();
  return value && isKnownAiModel(value) ? value : DEFAULT_AI_MODEL;
};

// AI_MODEL env var wins when set (the E2E mock and deploy-free tuning rely on
// it); otherwise the org-wide Settings choice, falling back to the default.
export const getAiModel = async (): Promise<string> => {
  const envModel = process.env.AI_MODEL;
  if (envModel) {
    return envModel;
  }
  return await getStoredAiModel();
};

// Graceful degradation (PRD §9.3): the core CRM must work without the
// assistant, so callers check this before touching the API.
export const isAiConfigured = (): boolean =>
  Boolean(process.env.ANTHROPIC_API_KEY);

// The only fields the assistant sends; typed straight off the SDK params so
// the call sites stay fully type-checked.
export type MessageRequest = Pick<
  Anthropic.MessageCreateParams,
  "max_tokens" | "messages" | "model" | "system" | "thinking" | "tools"
>;

const resolveConfig = (): { apiKey: string; baseURL: string } => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  // ANTHROPIC_BASE_URL lets Playwright point the assistant at the
  // deterministic mock server; trailing slash trimmed so paths join cleanly.
  const baseURL = (process.env.ANTHROPIC_BASE_URL ?? DEFAULT_BASE_URL).replace(
    TRAILING_SLASH,
    ""
  );
  return { apiKey, baseURL };
};

const requestHeaders = (apiKey: string): HeadersInit => ({
  "anthropic-version": ANTHROPIC_VERSION,
  "content-type": "application/json",
  "x-api-key": apiKey,
});

const postMessages = async (
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Response> => {
  const { apiKey, baseURL } = resolveConfig();
  const response = await fetch(`${baseURL}/v1/messages`, {
    body: JSON.stringify(body),
    headers: requestHeaders(apiKey),
    method: "POST",
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Anthropic API error ${response.status}: ${detail.slice(0, ERROR_BODY_MAX)}`
    );
  }
  return response;
};

// Non-streaming call, used by the eval runner. Guarded by the overall deadline
// so the eval runner can't hang on an unresponsive upstream either.
export const createMessage = async (
  body: MessageRequest
): Promise<Anthropic.Message> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), overallTimeoutMs());
  try {
    const response = await postMessages({ ...body }, controller.signal);
    return (await response.json()) as Anthropic.Message;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

type MutableBlock = Record<string, unknown>;

const appendString = (
  block: MutableBlock,
  key: string,
  value: string
): void => {
  block[key] = `${(block[key] as string) ?? ""}${value}`;
};

// Applies one content_block_delta to its block. Tool-use input arrives as
// partial JSON, accumulated via appendJson and parsed at content_block_stop.
const applyDelta = (
  block: MutableBlock,
  delta: Anthropic.RawContentBlockDelta,
  appendJson: (chunk: string) => void,
  handlers: StreamHandlers
): void => {
  if (delta.type === "text_delta") {
    appendString(block, "text", delta.text);
    handlers.onText(delta.text);
  } else if (delta.type === "input_json_delta") {
    appendJson(delta.partial_json);
  } else if (delta.type === "thinking_delta") {
    appendString(block, "thinking", delta.thinking);
    // Thinking emits no visible text; signal liveness so the client's
    // watchdog and "Thinking…" indicator track real upstream progress.
    handlers.onActivity?.();
    handlers.onThinking?.(delta.thinking);
  } else if (delta.type === "signature_delta") {
    appendString(block, "signature", delta.signature);
  } else if (delta.type === "citations_delta") {
    // Citations accumulate onto the owning text block so the assembled
    // finalMessage preserves them, exactly as a non-streaming response would
    // (persisted history then replays and re-renders them on resume).
    const citations: Anthropic.TextCitation[] = Array.isArray(block.citations)
      ? (block.citations as Anthropic.TextCitation[])
      : [];
    citations.push(delta.citation);
    block.citations = citations;
    handlers.onCitation?.(delta.citation);
  }
};

// Assembles the streamed content blocks into a final Anthropic.Message,
// emitting text deltas through onText as they arrive (mirrors the SDK's
// stream.on("text") + finalMessage()).
const assembleMessage = async (
  stream: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
  controller: AbortController
): Promise<Anthropic.Message> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let message: MutableBlock = {
    content: [],
    id: "",
    model: "",
    role: "assistant",
    stop_reason: null,
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  const blocks: MutableBlock[] = [];
  const jsonBuffers: Record<number, string> = {};

  const handleEvent = (event: Anthropic.RawMessageStreamEvent): void => {
    switch (event.type) {
      case "message_start":
        message = { ...(event.message as unknown as MutableBlock) };
        break;
      case "content_block_start":
        blocks[event.index] = {
          ...(event.content_block as unknown as MutableBlock),
        };
        if (event.content_block.type === "tool_use") {
          jsonBuffers[event.index] = "";
        }
        break;
      case "content_block_delta":
        applyDelta(
          blocks[event.index],
          event.delta,
          (chunk) => {
            jsonBuffers[event.index] += chunk;
          },
          handlers
        );
        break;
      case "ping":
        // Anthropic's keepalive during long phases; surface it as liveness.
        handlers.onActivity?.();
        break;
      case "content_block_stop": {
        const block = blocks[event.index];
        if (block?.type === "tool_use") {
          const raw = jsonBuffers[event.index];
          block.input = raw ? JSON.parse(raw) : {};
        }
        break;
      }
      case "message_delta":
        message.stop_reason = event.delta.stop_reason;
        message.stop_sequence = event.delta.stop_sequence;
        message.usage = {
          ...(message.usage as Record<string, unknown>),
          ...event.usage,
        };
        break;
      default:
        break;
    }
  };

  const dispatchLine = (line: string): void => {
    if (!line.startsWith("data:")) {
      return;
    }
    const payload = line.slice("data:".length).trim();
    if (!payload) {
      return;
    }
    handleEvent(JSON.parse(payload) as Anthropic.RawMessageStreamEvent);
  };

  // Idle watchdog: a chunk must arrive within UPSTREAM_IDLE_TIMEOUT_MS or we
  // abort the shared controller, which rejects the pending reader.read().
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const armIdle = (): void => {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => controller.abort(), idleTimeoutMs());
  };

  try {
    armIdle();
    let buffer = "";
    let reading = true;
    while (reading) {
      const { done, value } = await reader.read();
      if (done) {
        reading = false;
        break;
      }
      armIdle();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        dispatchLine(line.trim());
      }
    }
    buffer += decoder.decode();
    for (const line of buffer.split("\n")) {
      dispatchLine(line.trim());
    }
  } finally {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    reader.releaseLock();
  }

  message.content = blocks.filter(Boolean);
  return message as unknown as Anthropic.Message;
};

// Streaming call used by the agent loop. Resolves with the final assembled
// message once the stream completes. The controller is shared between the
// fetch and the read loop so either an overall-deadline expiry or an idle gap
// tears the whole call down; the abort surfaces as a friendly timeout error
// that the route forwards to the client instead of hanging.
export const streamMessage = async (
  body: MessageRequest,
  handlers: StreamHandlers
): Promise<Anthropic.Message> => {
  const controller = new AbortController();
  const overallTimer = setTimeout(() => controller.abort(), overallTimeoutMs());
  try {
    const response = await postMessages(
      { ...body, stream: true },
      controller.signal
    );
    if (!response.body) {
      throw new Error("Anthropic API returned an empty stream");
    }
    return await assembleMessage(response.body, handlers, controller);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    clearTimeout(overallTimer);
  }
};
