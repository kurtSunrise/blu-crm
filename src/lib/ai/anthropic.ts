// Local, type-only models of the Anthropic Messages API shapes the assistant
// uses. We deliberately do NOT depend on `@anthropic-ai/sdk`: even as a
// type-only import, having the package installed let the Cloudflare build
// pull its ~5 MiB of JS into the Worker bundle, pushing it over the 3 MiB
// limit. Vendoring the few types we touch keeps the API fully typed while
// guaranteeing the SDK can never enter the bundle. These cover only what we
// use; extend them if the assistant starts using more of the API.

export interface Usage {
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  input_tokens: number;
  output_tokens: number;
}

// Citation attached to a response text block when the request carried
// citable content (search_result blocks with citations enabled). Only
// search_result_location is modelled fully; the fallback member keeps the
// union open so other location types (char_location, page_location, ...)
// parse without breaking, and callers narrow with a type guard.
export interface SearchResultLocationCitation {
  cited_text: string;
  // Exclusive end index of the cited block range in the search result's
  // content array; always greater than start_block_index.
  end_block_index: number;
  // 0-based index of the cited search_result block among all search_result
  // blocks in the request, in the order they appear.
  search_result_index: number;
  source: string;
  start_block_index: number;
  title: string | null;
  type: "search_result_location";
}

export interface UnknownCitation {
  cited_text?: string;
  type: string;
  [key: string]: unknown;
}

export type TextCitation = SearchResultLocationCitation | UnknownCitation;

export interface TextBlock {
  citations?: TextCitation[] | null;
  text: string;
  type: "text";
}

export interface ToolUseBlock {
  id: string;
  input: unknown;
  name: string;
  type: "tool_use";
}

export interface ThinkingBlock {
  signature: string;
  thinking: string;
  type: "thinking";
}

export interface RedactedThinkingBlock {
  data: string;
  type: "redacted_thinking";
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ThinkingBlock
  | RedactedThinkingBlock;

export interface CacheControlEphemeral {
  type: "ephemeral";
}

export interface TextBlockParam {
  cache_control?: CacheControlEphemeral | null;
  text: string;
  type: "text";
}

export interface ToolUseBlockParam {
  id: string;
  input: unknown;
  name: string;
  type: "tool_use";
}

// A retrieved passage sent back to the model with citations enabled, either
// inside a tool_result content array (dynamic RAG: search_knowledge_base) or
// as top-level user content. The model's answering text blocks then carry
// search_result_location citations pointing back at these blocks.
export interface SearchResultBlockParam {
  cache_control?: CacheControlEphemeral | null;
  citations?: { enabled: boolean };
  content: TextBlockParam[];
  source: string;
  title: string;
  type: "search_result";
}

export interface ToolResultBlockParam {
  cache_control?: CacheControlEphemeral | null;
  content?:
    | string
    | Array<
        TextBlockParam | SearchResultBlockParam | { [key: string]: unknown }
      >;
  is_error?: boolean;
  tool_use_id: string;
  type: "tool_result";
}

// Vision input. The Messages API also accepts URL and Files-API sources;
// we only send base64 because our attachments live in a private R2 bucket
// that Anthropic's servers cannot fetch. HEIC is intentionally absent — the
// API does not accept it (see AI_READABLE_TYPES).
export interface Base64ImageSource {
  data: string;
  media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  type: "base64";
}

export interface ImageBlockParam {
  cache_control?: CacheControlEphemeral | null;
  source: Base64ImageSource;
  type: "image";
}

export interface Base64PDFSource {
  data: string;
  media_type: "application/pdf";
  type: "base64";
}

export interface DocumentBlockParam {
  cache_control?: CacheControlEphemeral | null;
  source: Base64PDFSource;
  title?: string | null;
  type: "document";
}

export interface ThinkingBlockParam {
  signature: string;
  thinking: string;
  type: "thinking";
}

export interface RedactedThinkingBlockParam {
  data: string;
  type: "redacted_thinking";
}

// Includes the response block shapes too, so an assistant message's returned
// content can be pushed straight back into the next request's history.
export type ContentBlockParam =
  | TextBlockParam
  | ImageBlockParam
  | DocumentBlockParam
  | SearchResultBlockParam
  | ToolUseBlockParam
  | ToolResultBlockParam
  | ThinkingBlockParam
  | RedactedThinkingBlockParam
  | ContentBlock;

export interface MessageParam {
  content: string | ContentBlockParam[];
  role: "user" | "assistant";
}

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | "pause_turn"
  | "refusal"
  | string;

export interface Message {
  content: ContentBlock[];
  id: string;
  model: string;
  role: "assistant";
  stop_reason: StopReason | null;
  stop_sequence: string | null;
  type: "message";
  usage: Usage;
}

export interface ToolInputSchema {
  properties?: Record<string, unknown> | null;
  required?: string[];
  type: "object";
  [key: string]: unknown;
}

export interface Tool {
  description?: string;
  input_schema: ToolInputSchema;
  name: string;
}

export type ThinkingConfigParam =
  | { budget_tokens: number; type: "enabled" }
  | { type: "disabled" }
  // display "summarized" streams readable thinking summaries; without it,
  // adaptive thinking emits empty deltas on current models
  | { display?: "summarized"; type: "adaptive" };

export interface MessageCreateParams {
  max_tokens: number;
  messages: MessageParam[];
  model: string;
  system?: string | TextBlockParam[];
  thinking?: ThinkingConfigParam;
  tools?: Tool[];
}

export interface TextDelta {
  text: string;
  type: "text_delta";
}

export interface InputJSONDelta {
  partial_json: string;
  type: "input_json_delta";
}

export interface ThinkingDelta {
  thinking: string;
  type: "thinking_delta";
}

export interface SignatureDelta {
  signature: string;
  type: "signature_delta";
}

export interface CitationsDelta {
  citation: TextCitation;
  type: "citations_delta";
}

export type RawContentBlockDelta =
  | TextDelta
  | InputJSONDelta
  | ThinkingDelta
  | SignatureDelta
  | CitationsDelta;

export type RawMessageStreamEvent =
  | { message: Message; type: "message_start" }
  | { content_block: ContentBlock; index: number; type: "content_block_start" }
  | { delta: RawContentBlockDelta; index: number; type: "content_block_delta" }
  | { index: number; type: "content_block_stop" }
  | {
      delta: { stop_reason: StopReason | null; stop_sequence: string | null };
      type: "message_delta";
      usage: Partial<Usage>;
    }
  | { type: "message_stop" }
  | { type: "ping" };
