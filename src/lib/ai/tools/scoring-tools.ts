import { and, eq, ilike, isNull, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { company, contact, deal, pipelineStage, user } from "@/db/schema";
import { type DealSummary, toDealSummary } from "@/lib/ai/tools/query-tools";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";
import { formatAudFromCents, MS_PER_DAY } from "@/lib/format";

// FR-7.5 lead scoring: rank open deals by likelihood to close, value, and
// deadline pressure. The score is computed here, deterministically, so the
// ranking is stable and every component is explainable; the model's job is
// to present the reasons, not to invent them.

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

// Component weights (sum 100). Likelihood leans on the stage's admin-set
// forecast weighting (FR-8.1), value is relative to the user's own open
// pipeline, and deadline pressure ramps as a fixed/expected date approaches.
const LIKELIHOOD_POINTS = 40;
const VALUE_POINTS = 30;
const DEADLINE_POINTS = 30;
const DEADLINE_HORIZON_DAYS = 45;
const PERCENT = 100;
const STALE_DAYS = 7;

interface ScoringRow {
  companyName: string | null;
  contactName: string | null;
  createdAt: Date;
  expectedCloseDate: Date | null;
  fixedDate: Date | null;
  fixedDateType: string | null;
  id: string;
  lastContactAt: Date | null;
  leadId: string;
  ownerName: string | null;
  stageName: string;
  title: string;
  valueCents: number | null;
  weighting: number;
}

interface ScoredDeal extends DealSummary {
  reasons: string[];
  score: number;
}

const daysUntil = (date: Date | null, now: Date): number | null =>
  date ? Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY) : null;

const deadlinePressure = (daysToDeadline: number | null): number => {
  if (daysToDeadline === null) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(daysToDeadline, DEADLINE_HORIZON_DAYS));
  return Math.round(
    ((DEADLINE_HORIZON_DAYS - clamped) / DEADLINE_HORIZON_DAYS) *
      DEADLINE_POINTS
  );
};

const scoreDeal = (
  row: ScoringRow,
  maxValueCents: number,
  now: Date
): ScoredDeal => {
  const reasons: string[] = [];

  const likelihood = Math.round(
    (Math.max(0, Math.min(row.weighting, PERCENT)) / PERCENT) *
      LIKELIHOOD_POINTS
  );
  reasons.push(
    `Stage "${row.stageName}" carries a ${row.weighting}% forecast weighting`
  );

  const value =
    row.valueCents && maxValueCents > 0
      ? Math.round((row.valueCents / maxValueCents) * VALUE_POINTS)
      : 0;
  if (row.valueCents) {
    reasons.push(`Valued at ${formatAudFromCents(row.valueCents)}`);
  } else {
    reasons.push("No value recorded yet");
  }

  const deadline = daysUntil(row.fixedDate ?? row.expectedCloseDate, now);
  const pressure = deadlinePressure(deadline);
  if (deadline !== null && deadline < 0) {
    reasons.push(`Deadline passed ${-deadline} days ago`);
  } else if (deadline !== null && pressure > 0) {
    reasons.push(
      `${row.fixedDate ? "Fixed date" : "Expected close"} in ${deadline} days`
    );
  }

  const summary = toDealSummary(row);
  if (
    summary.daysSinceContact !== null &&
    summary.daysSinceContact >= STALE_DAYS
  ) {
    reasons.push(`No contact for ${summary.daysSinceContact} days`);
  }

  return { ...summary, reasons, score: likelihood + value + pressure };
};

const rankOpenDealsSchema = z.object({
  limit: z.number().int().positive().max(MAX_LIMIT).optional(),
  ownerName: z
    .string()
    .optional()
    .describe("Only rank deals owned by this team member (partial name ok)"),
});

const rankOpenDeals = defineTool({
  description:
    "Rank open deals by chase priority: likelihood to close (stage forecast weighting), value, and deadline pressure, with staleness flagged. Call this when the user asks what to chase, prioritise, or focus on first. Each deal comes back with its score and the reasons behind it; explain the ranking using those reasons, never invented ones.",
  execute: async (input) => {
    const conditions: SQL[] = [
      isNull(deal.deletedAt),
      eq(pipelineStage.isWon, false),
      eq(pipelineStage.isLost, false),
    ];
    if (input.ownerName) {
      conditions.push(ilike(user.name, `%${input.ownerName}%`));
    }

    const rows: ScoringRow[] = await db
      .select({
        companyName: company.name,
        contactName: contact.name,
        createdAt: deal.createdAt,
        expectedCloseDate: deal.expectedCloseDate,
        fixedDate: deal.fixedDate,
        fixedDateType: deal.fixedDateType,
        id: deal.id,
        lastContactAt: deal.lastContactAt,
        leadId: deal.leadId,
        ownerName: user.name,
        stageName: pipelineStage.name,
        title: deal.title,
        valueCents: sql<
          number | null
        >`coalesce(${deal.quotedValueCents}, ${deal.estimatedValueCents})`,
        weighting: pipelineStage.weighting,
      })
      .from(deal)
      .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .leftJoin(company, eq(deal.companyId, company.id))
      .leftJoin(contact, eq(deal.contactId, contact.id))
      .leftJoin(user, eq(deal.ownerId, user.id))
      .where(and(...conditions));

    if (rows.length === 0) {
      return { resultText: "No open deals to rank." };
    }

    const now = new Date();
    const maxValueCents = Math.max(
      0,
      ...rows.map((row) => row.valueCents ?? 0)
    );
    const ranked = rows
      .map((row) => scoreDeal(row, maxValueCents, now))
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? DEFAULT_LIMIT);

    return {
      artifacts: [
        {
          artifactType: "deal_list" as const,
          data: { deals: ranked, title: "Deals to chase first" },
          type: "artifact" as const,
        },
      ],
      resultText: JSON.stringify(
        ranked.map((entry) => ({
          leadId: entry.leadId,
          reasons: entry.reasons,
          score: entry.score,
          title: entry.title,
        }))
      ),
    };
  },
  isWrite: false,
  name: "rank_open_deals",
  schema: rankOpenDealsSchema,
});

export const scoringTools: AiTool[] = [rankOpenDeals];
