import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ArtifactPayload } from "@/lib/ai/stream-protocol";

export interface AiToolContext {
  threadId: string;
  userId: string;
}

export interface AiToolOutcome {
  artifacts?: ArtifactPayload[];
  resultText: string;
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
const toInputSchema = (schema: z.ZodType): Anthropic.Tool.InputSchema => {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _omitted, ...rest } = jsonSchema;
  return rest as Anthropic.Tool.InputSchema;
};

export const defineTool = <TSchema extends z.ZodType>(options: {
  description: string;
  execute: (input: z.infer<TSchema>, ctx: AiToolContext) => Promise<AiToolOutcome>;
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
