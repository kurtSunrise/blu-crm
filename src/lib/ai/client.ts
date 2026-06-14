import type Anthropic from "@anthropic-ai/sdk";

// Direct REST client for the Anthropic Messages API. We call the HTTP
// endpoint with fetch instead of the official SDK so the SDK stays out of
// the Cloudflare Worker bundle (it pushed the Worker past the 3 MiB limit);
// the SDK's TYPES are still used everywhere via `import type`, which is
// erased at build time and costs no bundle bytes. workerd has a native
// fetch + streaming, so nothing here needs a Node polyfill.

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const ERROR_BODY_MAX = 500;
const TRAILING_SLASH = /\/$/;

// Model is env-configurable so it can change without a deploy (M4 decision).
export const getAiModel = (): string => process.env.AI_MODEL ?? DEFAULT_MODEL;

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
  body: Record<string, unknown>
): Promise<Response> => {
  const { apiKey, baseURL } = resolveConfig();
  const response = await fetch(`${baseURL}/v1/messages`, {
    body: JSON.stringify(body),
    headers: requestHeaders(apiKey),
    method: "POST",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Anthropic API error ${response.status}: ${detail.slice(0, ERROR_BODY_MAX)}`
    );
  }
  return response;
};

// Non-streaming call, used by the eval runner.
export const createMessage = async (
  body: MessageRequest
): Promise<Anthropic.Message> => {
  const response = await postMessages({ ...body });
  return (await response.json()) as Anthropic.Message;
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
  onText: (delta: string) => void
): void => {
  if (delta.type === "text_delta") {
    appendString(block, "text", delta.text);
    onText(delta.text);
  } else if (delta.type === "input_json_delta") {
    appendJson(delta.partial_json);
  } else if (delta.type === "thinking_delta") {
    appendString(block, "thinking", delta.thinking);
  } else if (delta.type === "signature_delta") {
    appendString(block, "signature", delta.signature);
  }
};

// Assembles the streamed content blocks into a final Anthropic.Message,
// emitting text deltas through onText as they arrive (mirrors the SDK's
// stream.on("text") + finalMessage()).
const assembleMessage = async (
  stream: ReadableStream<Uint8Array>,
  onText: (delta: string) => void
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
          onText
        );
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

  let buffer = "";
  let reading = true;
  while (reading) {
    const { done, value } = await reader.read();
    if (done) {
      reading = false;
      break;
    }
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

  message.content = blocks.filter(Boolean);
  return message as unknown as Anthropic.Message;
};

// Streaming call used by the agent loop. Resolves with the final assembled
// message once the stream completes.
export const streamMessage = async (
  body: MessageRequest,
  onText: (delta: string) => void
): Promise<Anthropic.Message> => {
  const response = await postMessages({ ...body, stream: true });
  if (!response.body) {
    throw new Error("Anthropic API returned an empty stream");
  }
  return assembleMessage(response.body, onText);
};
