import { z } from "zod";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";

// Drafts are text-only artifacts: nothing is sent or saved, so this tool is
// not confirmation-gated (FR-7.4 / 7.9 / 7.10).
const presentDraftSchema = z.object({
  body: z.string().describe("The full draft text, ready to copy"),
  kind: z.enum([
    "followup_email",
    "followup_sms",
    "call_script",
    "qualification_questions",
    "quote_cover_note",
  ]),
  signoffName: z
    .string()
    .optional()
    .describe("Team member name the draft is signed with"),
  subject: z.string().optional().describe("Subject line, for emails only"),
  title: z
    .string()
    .optional()
    .describe("Short label for the draft card, e.g. 'Follow-up to Westfield'"),
});

const presentDraft = defineTool({
  description:
    "Present a finished piece of client communication (follow-up email or SMS, call script, qualification questions, or quote cover note) as an editable draft card the user can copy. Always deliver drafts through this tool rather than as plain chat text. Remember: no em dashes in the draft body, AUD currency, DD/MM/YYYY dates.",
  execute: (input) =>
    Promise.resolve({
      artifacts: [
        {
          artifactType: "draft_message" as const,
          data: input,
          type: "artifact" as const,
        },
      ],
      resultText:
        "Draft presented to the user as an editable card in the chat panel.",
    }),
  isWrite: false,
  name: "present_draft",
  schema: presentDraftSchema,
});

export const draftTools: AiTool[] = [presentDraft];
