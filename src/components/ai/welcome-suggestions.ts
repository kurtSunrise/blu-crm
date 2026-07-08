// Context-aware starter prompts for the assistant's empty state. Pure lookup
// (no client hooks) so ThreadWelcome can stay the only consumer; the deal and
// contact sets fill the entity label registered by the page's AiEntityBeacon.

export interface WelcomeEntity {
  label: string;
  type: "deal" | "contact";
}

// A starter prompt splits its short chip label from the full text that is
// actually sent. Generic prompts are already short, so `display` equals
// `prompt`; entity prompts keep the record name out of the chip (the entity
// chip above the composer already names it) but still send it in full, so the
// assistant gets an unambiguous reference and the transcript reads clearly.
export interface WelcomeSuggestion {
  display: string;
  prompt: string;
}

const plain = (prompt: string): WelcomeSuggestion => ({
  display: prompt,
  prompt,
});

const DEFAULT_SUGGESTIONS: WelcomeSuggestion[] = [
  "Which deals have gone quiet for over a week?",
  "What's closing in the next 14 days?",
  "What's in the inbox?",
].map(plain);

const INBOX_SUGGESTIONS: WelcomeSuggestion[] = [
  "Triage the inbox for me",
  "Which enquiries look most valuable?",
  "Capture the newest enquiry as a lead",
].map(plain);

const PIPELINE_SUGGESTIONS: WelcomeSuggestion[] = [
  "Which deals should I chase today?",
  "Rank my open deals by value",
  "Which deals have gone quiet for over a week?",
].map(plain);

const dealSuggestions = (label: string): WelcomeSuggestion[] => [
  {
    display: "Summarise this deal and suggest the next action",
    prompt: `Summarise ${label} and suggest the next action`,
  },
  {
    display: "Draft a follow-up message",
    prompt: `Draft a follow-up message for ${label}`,
  },
  {
    display: "What's the history on this deal?",
    prompt: `What's the history on ${label}?`,
  },
];

const contactSuggestions = (label: string): WelcomeSuggestion[] => [
  {
    display: "Summarise this contact and our recent activity",
    prompt: `Summarise ${label} and our recent activity`,
  },
  {
    display: "Draft a check-in message",
    prompt: `Draft a check-in message for ${label}`,
  },
  {
    display: "What deals are linked to this contact?",
    prompt: `What deals are linked to ${label}?`,
  },
];

export const suggestionsForContext = (
  pathname: string,
  entity: WelcomeEntity | null
): WelcomeSuggestion[] => {
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
