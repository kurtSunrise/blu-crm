import { z } from "zod";
import { assignDealOwner, discardLead } from "@/lib/actions/inbox-actions";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";
import { updateContactFieldsCore } from "@/lib/mutations/contact";

const triageSchema = z
  .object({
    action: z.enum(["assign", "discard"]),
    dealId: z.string().describe("Deal id from get_inbox_leads"),
    ownerId: z
      .string()
      .optional()
      .describe("Required for assign: team member id from list_team_members"),
  })
  .refine((value) => value.action !== "assign" || Boolean(value.ownerId), {
    message: "ownerId is required when assigning",
  });

const triageInboxLeadTool = defineTool({
  description:
    "Triage an unassigned inbox lead: assign it to a team member (who gets notified) or discard it (soft delete). Call get_inbox_leads first to identify the lead.",
  execute: async (input) => {
    if (input.action === "assign") {
      const outcome = await assignDealOwner({
        dealId: input.dealId,
        ownerId: input.ownerId,
      });
      if (outcome.error) {
        return { resultText: `Assignment failed: ${outcome.error}` };
      }
      return {
        changedPaths: ["/inbox", "/pipeline", `/deals/${input.dealId}`],
        resultText: "Lead assigned.",
      };
    }
    const outcome = await discardLead({ dealId: input.dealId });
    if (outcome.error) {
      return { resultText: `Discard failed: ${outcome.error}` };
    }
    return {
      changedPaths: ["/inbox", "/pipeline"],
      resultText: "Lead discarded (soft deleted).",
    };
  },
  isWrite: true,
  name: "triage_inbox_lead",
  schema: triageSchema,
});

const updateContactSchema = z.object({
  companyName: z.string().optional(),
  contactId: z.string().describe("Contact id from get_contact"),
  email: z.string().optional(),
  name: z.string().optional(),
  notes: z.string().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
});

const updateContactTool = defineTool({
  description:
    "Update fields on an existing contact. Only include the fields that should change.",
  execute: async (input) => {
    const outcome = await updateContactFieldsCore(input);
    if (outcome.error) {
      return { resultText: `Contact update failed: ${outcome.error}` };
    }
    return {
      changedPaths: ["/contacts", `/contacts/${input.contactId}`],
      resultText: "Contact updated.",
    };
  },
  isWrite: true,
  name: "update_contact",
  schema: updateContactSchema,
});

export const triageTools: AiTool[] = [triageInboxLeadTool, updateContactTool];
