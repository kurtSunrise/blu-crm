import Anthropic from "@anthropic-ai/sdk";

// Model is env-configurable so it can change without a deploy (M4 decision).
const DEFAULT_MODEL = "claude-opus-4-8";

export const getAiModel = (): string => process.env.AI_MODEL ?? DEFAULT_MODEL;

// Graceful degradation (PRD §9.3): the core CRM must work without the
// assistant, so callers check this before touching the API.
export const isAiConfigured = (): boolean =>
  Boolean(process.env.ANTHROPIC_API_KEY);

// The SDK reads ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL from the
// environment; the base URL override is what lets Playwright point the
// assistant at a deterministic mock server.
export const createAnthropicClient = (): Anthropic => new Anthropic();
