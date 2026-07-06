// Context-aware starter prompts for the assistant's empty state. Pure lookup
// (no client hooks) so ThreadWelcome can stay the only consumer; the deal and
// contact sets fill the entity label registered by the page's AiEntityBeacon.

export interface WelcomeEntity {
  label: string;
  type: "deal" | "contact";
}

const DEFAULT_SUGGESTIONS = [
  "Which deals have gone quiet for over a week?",
  "What's closing in the next 14 days?",
  "What's in the inbox?",
];

const INBOX_SUGGESTIONS = [
  "Triage the inbox for me",
  "Which enquiries look most valuable?",
  "Capture the newest enquiry as a lead",
];

const PIPELINE_SUGGESTIONS = [
  "Which deals should I chase today?",
  "Rank my open deals by value",
  "Which deals have gone quiet for over a week?",
];

const dealSuggestions = (label: string): string[] => [
  `Summarise ${label} and suggest the next action`,
  `Draft a follow-up message for ${label}`,
  `What's the history on ${label}?`,
];

const contactSuggestions = (label: string): string[] => [
  `Summarise ${label} and our recent activity`,
  `Draft a check-in message for ${label}`,
  `What deals are linked to ${label}?`,
];

export const suggestionsForContext = (
  pathname: string,
  entity: WelcomeEntity | null
): string[] => {
  if (entity?.type === "deal") {
    return dealSuggestions(entity.label);
  }
  if (entity?.type === "contact") {
    return contactSuggestions(entity.label);
  }
  if (pathname.startsWith("/inbox")) {
    return INBOX_SUGGESTIONS;
  }
  if (pathname.startsWith("/pipeline")) {
    return PIPELINE_SUGGESTIONS;
  }
  return DEFAULT_SUGGESTIONS;
};
