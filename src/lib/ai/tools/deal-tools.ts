import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { attachment, chatAttachment, deal } from "@/db/schema";
import { logQuickActivity, moveDealStage } from "@/lib/actions/deal-actions";
import {
  DEAL_HANDLE_DESCRIPTION,
  resolveDealId,
  resolveStageId,
  STAGE_HANDLE_DESCRIPTION,
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
  stage: z.string().describe(STAGE_HANDLE_DESCRIPTION),
});

const moveDealStageTool = defineTool({
  description:
    "Move a deal to another pipeline stage. Call list_pipeline_stages first and pass the target stage's name. Moving to Lost / Dormant requires a lostReason; moving to Won may flag handoverToDelivery.",
  execute: async (input) => {
    const dealId = await resolveDealId(input.dealId);
    if (!dealId) {
      return {
        resultText: `No deal found for "${input.dealId}". Use query_deals or get_deal to find it.`,
      };
    }
    const stage = await resolveStageId(input.stage);
    if (!stage) {
      return {
        resultText: `No stage matches "${input.stage}". Call list_pipeline_stages for the exact names.`,
      };
    }
    const outcome = await moveDealStage({
      dealId,
      handoverToDelivery: input.handoverToDelivery,
      lostReason: input.lostReason,
      stageId: stage.id,
    });
    if (outcome.error) {
      return { resultText: `Stage move failed: ${outcome.error}` };
    }
    return {
      changedPaths: ["/", "/pipeline", `/deals/${dealId}`],
      resultText: `Deal moved to ${stage.name}.`,
    };
  },
  isWrite: true,
  name: "move_deal_stage",
  schema: moveDealStageSchema,
});

const logActivitySchema = z.object({
  audioAttachmentId: z
    .uuid()
    .optional()
    .describe(
      "Attach the voice note the user just recorded, when they ask to file it"
    ),
  content: z.string().optional().describe("What happened, in one line"),
  dealId: z.string().describe(DEAL_HANDLE_DESCRIPTION),
  type: z.enum(QUICK_LOG_TYPES),
});

// Files a retained voice note (a chat_attachment written by the transcribe
// route, FR-7.7) against the deal by inserting a deal attachment row pointing
// at the SAME R2 object; no bytes are copied. Runs after the activity insert
// so a crash leaves the activity without its file, which the user can simply
// re-attach. Ownership: the chat attachment must belong to the acting user.
const attachVoiceNoteToDeal = async (params: {
  audioAttachmentId: string;
  dealId: string;
  userId: string;
}): Promise<boolean> => {
  const [voiceNote] = await db
    .select({
      contentType: chatAttachment.contentType,
      fileKey: chatAttachment.fileKey,
      fileName: chatAttachment.fileName,
      sizeBytes: chatAttachment.sizeBytes,
    })
    .from(chatAttachment)
    .where(
      and(
        eq(chatAttachment.id, params.audioAttachmentId),
        eq(chatAttachment.uploadedBy, params.userId)
      )
    )
    .limit(1);
  if (!voiceNote) {
    return false;
  }
  // Copy the bytes to a deal-owned R2 object rather than sharing the chat
  // object's key: the deal-attachment DELETE route purges its fileKey from R2
  // unconditionally, so a shared key would let deleting one row 404 the other
  // (and filing one recording on two deals would alias all three rows).
  // Voice notes are capped at 5 MB, so the copy is cheap.
  const { env } = getCloudflareContext();
  const source = await env.PHOTO_BUCKET.get(voiceNote.fileKey);
  if (!source) {
    return false;
  }
  const dealFileKey = `deals/${params.dealId}/${crypto.randomUUID()}/${voiceNote.fileName}`;
  await env.PHOTO_BUCKET.put(dealFileKey, await source.arrayBuffer(), {
    httpMetadata: { contentType: voiceNote.contentType },
  });
  await db.insert(attachment).values({
    contentType: voiceNote.contentType,
    dealId: params.dealId,
    fileKey: dealFileKey,
    fileName: voiceNote.fileName,
    sizeBytes: voiceNote.sizeBytes,
    uploadedBy: params.userId,
  });
  return true;
};

const logActivityTool = defineTool({
  description:
    "Log an activity (call, email, site visit, meeting, or note) on a deal's timeline. This also updates the deal's last-contact date, clearing staleness alerts. When the user dictated a voice note and asks to file it, pass its audioAttachmentId to attach the recording to the deal.",
  execute: async (input, ctx) => {
    const { audioAttachmentId, ...activityInput } = input;
    const dealId = await resolveDealId(input.dealId);
    if (!dealId) {
      return {
        resultText: `No deal found for "${input.dealId}". Use query_deals or get_deal to find it.`,
      };
    }
    const outcome = await logQuickActivity({ ...activityInput, dealId });
    if (outcome.error) {
      return { resultText: `Logging failed: ${outcome.error}` };
    }
    if (audioAttachmentId) {
      const attached = await attachVoiceNoteToDeal({
        audioAttachmentId,
        dealId,
        userId: ctx.userId,
      });
      if (!attached) {
        return {
          changedPaths: ["/", `/deals/${dealId}`],
          resultText:
            "Activity logged, but the voice note could not be attached (recording not found).",
        };
      }
      return {
        changedPaths: ["/", `/deals/${dealId}`],
        resultText: "Activity logged with the voice note attached.",
      };
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
