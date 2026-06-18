import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSetting } from "@/db/schema";

// Freeform team guidance appended to the assistant's system prompt. Authored by
// authenticated team members in Settings → AI Preferences, so it is trusted and
// presented as genuine instructions (unlike <page_context>/<enquiry_data> client
// data, which the static system prompt's Boundaries section treats as untrusted).
// Org-wide, consistent with every other app_setting entry.

export const AI_ASSISTANT_INSTRUCTIONS_KEY = "ai_assistant_instructions";

export const getAssistantInstructions = async (): Promise<string> => {
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, AI_ASSISTANT_INSTRUCTIONS_KEY))
    .limit(1);
  return row?.value?.trim() ?? "";
};

// Wraps saved guidance as a labelled system block. Returns null when empty so
// no extra block is added and the static prompt's cache prefix is untouched.
export const buildInstructionsBlock = (instructions: string): string | null => {
  if (!instructions) {
    return null;
  }
  return `# Team instructions

The Blu Builders team has configured the following guidance. Follow it whenever it applies, especially when drafting client communication:

${instructions}`;
};
