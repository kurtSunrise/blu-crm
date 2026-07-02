// Catalog of Claude models the in-app assistant can run on. This module is
// pure — no DB or server-only imports — so the client settings form, server
// validation, and the runtime model resolver can all share one source of
// truth. The active model is chosen org-wide in Settings → AI Preferences and
// resolved by getAiModel in ./client.

export const AI_MODEL_KEY = "ai_model";

export const DEFAULT_AI_MODEL = "claude-sonnet-5";

export interface AiModelOption {
  description: string;
  id: string;
  label: string;
}

// Only models that support the assistant's vision + tool use. Order is the
// order shown in the dropdown.
export const AI_MODEL_OPTIONS: readonly AiModelOption[] = [
  {
    description:
      "Strongest reasoning for complex, high-stakes drafting. Slower and more expensive.",
    id: "claude-opus-4-8",
    label: "Opus 4.8 — most capable",
  },
  {
    description:
      "Fast and highly capable for everyday drafting and reading deal files.",
    id: "claude-sonnet-5",
    label: "Sonnet 5 — balanced (recommended)",
  },
  {
    description:
      "Quickest and cheapest. Best for short, simple replies where speed matters most.",
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5 — fastest",
  },
] as const;

const AI_MODEL_IDS = new Set(AI_MODEL_OPTIONS.map((option) => option.id));

export const isKnownAiModel = (value: string): boolean =>
  AI_MODEL_IDS.has(value);
