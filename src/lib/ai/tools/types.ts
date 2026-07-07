import { z } from "zod";
import type * as Anthropic from "@/lib/ai/anthropic";
import type { ArtifactPayload, SourceRef } from "@/lib/ai/stream-protocol";

export interface AiToolContext {
  threadId: string;
  userId: string;
}

export interface AiToolOutcome {
  artifacts?: ArtifactPayload[];
  // Routes a write executed after confirmation emits data_changed for these
  // paths so the open pages refresh (router.refresh on the client)
  changedPaths?: string[];
  // Real image blocks the model should see this turn (e.g. view_deal_file).
  // The agent loop puts these in the live tool result only; the persisted
  // result keeps just resultText so history stays lean and replay-cheap.
  media?: Anthropic.ImageBlockParam[];
  resultText: string;
  // Knowledge-base attributions behind the answer, streamed to the client as
  // a `sources` payload and rendered as source chips
  sources?: SourceRef[];
}

export interface AiTool {
  definition: Anthropic.Tool;
  execute: (input: unknown, ctx: AiToolContext) => Promise<AiToolOutcome>;
  isWrite: boolean;
}

// Zod stays the runtime validator (confirmation round-trips re-validate
// edited inputs against the same schema); the API gets the derived JSON
// Schema. Derivation is deterministic, which keeps the tools cache prefix
// byte-stable.
const toInputSchema = (schema: z.ZodType): Anthropic.ToolInputSchema => {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _omitted, ...rest } = jsonSchema;
  return rest as Anthropic.ToolInputSchema;
};

export const defineTool = <TSchema extends z.ZodType>(options: {
  description: string;
  execute: (
    input: z.infer<TSchema>,
    ctx: AiToolContext
  ) => Promise<AiToolOutcome>;
  isWrite: boolean;
  name: string;
  schema: TSchema;
}): AiTool => ({
  definition: {
    description: options.description,
    input_schema: toInputSchema(options.schema),
    name: options.name,
  },
  execute: (input, ctx) => options.execute(options.schema.parse(input), ctx),
  isWrite: options.isWrite,
});
