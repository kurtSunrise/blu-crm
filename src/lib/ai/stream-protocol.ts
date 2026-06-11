// Wire protocol between /api/chat and the chat runtime adapter: one JSON
// payload per line (NDJSON). Isomorphic — no server-only imports — so the
// client parser and server encoder share these types.

export type ArtifactType =
  | "deal_card"
  | "deal_list"
  | "lead_intake_draft"
  | "draft_message"
  | "score_list";

export interface ArtifactPayload {
  artifactType: ArtifactType;
  data: unknown;
  type: "artifact";
}

export type StreamPayload =
  | ArtifactPayload
  | { type: "thread"; threadId: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; toolUseId: string; toolName: string }
  | { type: "tool_done"; toolUseId: string; toolName: string }
  | {
      type: "confirmation_request";
      toolUseId: string;
      toolName: string;
      input: unknown;
      summary: string;
    }
  | { type: "data_changed"; paths: string[] }
  | { type: "error"; message: string; retryable: boolean }
  | { type: "done"; messageId: string | null };

export const encodeStreamPayload = (payload: StreamPayload): string =>
  `${JSON.stringify(payload)}\n`;

const isStreamPayload = (value: unknown): value is StreamPayload =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof (value as { type: unknown }).type === "string";

export const parseStreamLine = (line: string): StreamPayload | null => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isStreamPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// Reads an NDJSON body and invokes onPayload per decoded line, buffering
// partial lines across chunks (the Billify reader pattern).
export const readStreamPayloads = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onPayload: (payload: StreamPayload) => void
): Promise<void> => {
  const decoder = new TextDecoder();
  let pending = "";

  const handle = (line: string) => {
    const payload = parseStreamLine(line);
    if (payload) {
      onPayload(payload);
    }
  };

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
      handle(line);
    }
  }

  if (pending.trim().length > 0) {
    handle(pending);
  }
};
