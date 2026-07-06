// Follow-up suggestion chips offered after a completed assistant turn.
// Deterministic rule table keyed on what the turn actually did: no extra
// model call, so the prompt cache prefix is untouched and the chips cost
// nothing. Copy stays short and plain (phone-first, no em dashes).

export interface SuggestionInput {
  artifactTypes: string[];
  toolsUsed: string[];
  wroteChanges: boolean;
}

const MAX_SUGGESTIONS = 3;

// Checked in order; earlier rules describe more specific activity and win
// the limited slots.
const SUGGESTION_RULES: {
  prompts: string[];
  when: (input: SuggestionInput) => boolean;
}[] = [
  {
    prompts: ["What should I do next on this deal?"],
    when: (input) => input.wroteChanges,
  },
  {
    prompts: [
      "Draft a follow-up email for this deal",
      "Log an activity on this deal",
    ],
    when: (input) => input.artifactTypes.includes("deal_card"),
  },
  {
    prompts: ["Draft a follow-up for the top deal"],
    when: (input) => input.toolsUsed.includes("rank_open_deals"),
  },
  {
    prompts: ["Help me triage the first lead"],
    when: (input) => input.toolsUsed.includes("get_inbox_leads"),
  },
  {
    prompts: ["Show the exact policy wording"],
    when: (input) => input.toolsUsed.includes("search_knowledge_base"),
  },
  {
    prompts: ["Make the draft shorter"],
    when: (input) => input.artifactTypes.includes("draft_message"),
  },
  {
    prompts: ["Which of these should I chase first?"],
    when: (input) =>
      input.artifactTypes.includes("deal_list") ||
      input.toolsUsed.includes("query_deals"),
  },
];

// Offered when the turn used no tools at all (a plain conversational answer).
const DEFAULT_SUGGESTIONS = [
  "What deals need attention today?",
  "What is waiting in the inbox?",
  "Summarise my pipeline",
];

export const deriveFollowUpSuggestions = (input: SuggestionInput): string[] => {
  const prompts: string[] = [];
  for (const rule of SUGGESTION_RULES) {
    if (!rule.when(input)) {
      continue;
    }
    for (const prompt of rule.prompts) {
      if (!prompts.includes(prompt)) {
        prompts.push(prompt);
      }
    }
  }
  if (prompts.length === 0) {
    prompts.push(...DEFAULT_SUGGESTIONS);
  }
  return prompts.slice(0, MAX_SUGGESTIONS);
};
