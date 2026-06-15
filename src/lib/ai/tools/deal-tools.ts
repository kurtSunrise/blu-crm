import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { deal } from "@/db/schema";
import { logQuickActivity, moveDealStage } from "@/lib/actions/deal-actions";
import {
  DEAL_HANDLE_DESCRIPTION,
  resolveDealId,
} from "@/lib/ai/tools/resolve-deal";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";
import { dollarsToCents } from "@/lib/format";
import { createLead } from "@/lib/intake";
import { updateDealFieldsCore } from "@/lib/mutations/deal";
import {
  LOST_REASONS,
  PROJECT_TYPES,
  QUICK_LOG_TYPES,
} from "@/lib/validation/deal";

// Write tools: never executed inside the agent loop. The loop pauses on
// them, the user confirms (FR-7.8), and the route executes via the same
// registry. Each delegates to the existing mutation path the UI uses.

const isoDate = z.string().describe("Date as YYYY-MM-DD (interpreted in AWST)");

const parseDate = (value: string | undefined): Date | undefined => {
  if (!value) {
    return;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed;
};

const createLeadSchema = z
  .object({
    companyName: z.string().optional().describe("Client / brand name"),
    contactEmail: z.string().optional(),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    estimatedValueDollars: z
      .number()
      .positive()
      .optional()
      .describe("Estimated value in AUD dollars, only if the client gave one"),
    fixedDate: isoDate.optional().describe("Fixed install/event/launch date"),
    fixedDateType: z.enum(["install", "event", "launch"]).optional(),
    ownerId: z
      .string()
      .optional()
      .describe(
        "Team member id from list_team_members; omit to leave in the inbox"
      ),
    projectType: z.enum(PROJECT_TYPES).optional(),
    rawNote: z
      .string()
      .optional()
      .describe("The original enquiry text, attached to the timeline verbatim"),
    scopeSummary: z.string().optional(),
    source: z
      .enum(["web", "instagram", "referral", "repeat_client", "other"])
      .optional(),
    title: z.string().optional().describe("Deal title; derived if omitted"),
  })
  .refine(
    (value) =>
      Boolean(value.companyName ?? value.contactName ?? value.contactEmail),
    { message: "Provide at least a company name, contact name, or email" }
  );

const createLeadTool = defineTool({
  description:
    "Create a new lead (deal) in the pipeline from an enquiry or instruction. Before proposing this, ask the user for any missing critical fields (budget, fixed date, venue, decision-maker) rather than inventing them; include the original enquiry text as rawNote when one was pasted. The deal lands in Lead Captured, or in the inbox when no owner is given.",
  execute: async (input) => {
    const dealId = await createLead({
      companyName: input.companyName,
      contactEmail: input.contactEmail,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      estimatedValueCents: input.estimatedValueDollars
        ? dollarsToCents(input.estimatedValueDollars)
        : undefined,
      fixedDate: parseDate(input.fixedDate),
      ownerId: input.ownerId,
      projectType: input.projectType,
      rawNote: input.rawNote,
      scopeSummary: input.scopeSummary,
      source: input.source ?? "other",
      title: input.title,
    });
    if (!dealId) {
      return { resultText: "Failed to create the lead." };
    }

    const [created] = await db
      .select({ leadId: deal.leadId, title: deal.title })
      .from(deal)
      .where(eq(deal.id, dealId))
      .limit(1);

    revalidatePath("/");
    revalidatePath("/pipeline");
    revalidatePath("/inbox");

    return {
      changedPaths: ["/", "/pipeline", "/inbox", `/deals/${dealId}`],
      resultText: JSON.stringify({
        dealId,
        leadId: created?.leadId,
        title: created?.title,
      }),
    };
  },
  isWrite: true,
  name: "create_lead",
  schema: createLeadSchema,
});

const updateDealSchema = z.object({
  dealId: z.string().describe(DEAL_HANDLE_DESCRIPTION),
  decisionMakerConfirmed: z.boolean().optional(),
  estimatedValueDollars: z.number().positive().optional(),
  expectedCloseDate: isoDate.optional(),
  fixedDate: isoDate.optional(),
  fixedDateType: z.enum(["install", "event", "launch"]).optional(),
  notes: z.string().optional(),
  ownerId: z
    .string()
    .optional()
    .describe("Team member id from list_team_members"),
  projectType: z.enum(PROJECT_TYPES).optional(),
  scopeSummary: z.string().optional(),
  title: z.string().optional(),
  venue: z.string().optional(),
});

const updateDealTool = defineTool({
  description:
    "Update fields on an existing deal (title, value, venue, scope, project type, dates, decision-maker flag, owner, notes). Only include the fields that should change. Use move_deal_stage for stage changes.",
  execute: async (input, ctx) => {
    const { dealId: dealHandle, expectedCloseDate, fixedDate, ...rest } = input;
    const dealId = await resolveDealId(dealHandle);
    if (!dealId) {
      return {
        resultText: `No deal found for "${dealHandle}". Use query_deals or get_deal to find it.`,
      };
    }
    const outcome = await updateDealFieldsCore({
      ...rest,
      dealId,
      expectedCloseDate: parseDate(expectedCloseDate),
      fixedDate: parseDate(fixedDate),
      updatedBy: ctx.userId,
    });
    if (outcome.error) {
      return { resultText: `Update failed: ${outcome.error}` };
    }
    return {
      changedPaths: ["/pipeline", `/deals/${dealId}`],
      resultText: `Updated ${outcome.changedFields?.join(", ") ?? "deal"}.`,
    };
  },
  isWrite: true,
  name: "update_deal",
  schema: updateDealSchema,
});

const moveDealStageSchema = z.object({
  dealId: z.string().describe(DEAL_HANDLE_DESCRIPTION),
  handoverToDelivery: z
    .boolean()
    .optional()
    .describe("Only when moving to Won: flag handover to delivery"),
  lostReason: z
    .enum(LOST_REASONS)
    .optional()
    .describe("Required when moving to Lost / Dormant"),
  stageId: z.string().describe("Target stage id from list_pipeline_stages"),
});

const moveDealStageTool = defineTool({
  description:
    "Move a deal to another pipeline stage. Call list_pipeline_stages first for the stage id. Moving to Lost / Dormant requires a lostReason; moving to Won may flag handoverToDelivery.",
  execute: async (input) => {
    const dealId = await resolveDealId(input.dealId);
    if (!dealId) {
      return {
        resultText: `No deal found for "${input.dealId}". Use query_deals or get_deal to find it.`,
      };
    }
    const outcome = await moveDealStage({ ...input, dealId });
    if (outcome.error) {
      return { resultText: `Stage move failed: ${outcome.error}` };
    }
    return {
      changedPaths: ["/", "/pipeline", `/deals/${dealId}`],
      resultText: "Deal moved.",
    };
  },
  isWrite: true,
  name: "move_deal_stage",
  schema: moveDealStageSchema,
});

const logActivitySchema = z.object({
  content: z.string().optional().describe("What happened, in one line"),
  dealId: z.string().describe(DEAL_HANDLE_DESCRIPTION),
  type: z.enum(QUICK_LOG_TYPES),
});

const logActivityTool = defineTool({
  description:
    "Log an activity (call, email, site visit, meeting, or note) on a deal's timeline. This also updates the deal's last-contact date, clearing staleness alerts.",
  execute: async (input) => {
    const dealId = await resolveDealId(input.dealId);
    if (!dealId) {
      return {
        resultText: `No deal found for "${input.dealId}". Use query_deals or get_deal to find it.`,
      };
    }
    const outcome = await logQuickActivity({ ...input, dealId });
    if (outcome.error) {
      return { resultText: `Logging failed: ${outcome.error}` };
    }
    return {
      changedPaths: ["/", `/deals/${dealId}`],
      resultText: "Activity logged.",
    };
  },
  isWrite: true,
  name: "log_activity",
  schema: logActivitySchema,
});

export const dealWriteTools: AiTool[] = [
  createLeadTool,
  updateDealTool,
  moveDealStageTool,
  logActivityTool,
];
