import { asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { PipelineBoard } from "@/components/pipeline-board";
import { db } from "@/db";
import {
  company,
  deal,
  followUp,
  pipelineStage,
  quote,
  user,
} from "@/db/schema";
import type { DealSubStatusOption } from "@/lib/labels";
import { getPipelineTooltipSettings } from "@/lib/pipeline-tooltip";
import { getAllSubStatuses, getSubStatusPlacement } from "@/lib/sub-statuses";

export const dynamic = "force-dynamic";

interface NextFollowUp {
  action: string;
  dueDate: string;
}

interface DealValue {
  valueCents: number;
  valueRange: { maxCents: number; minCents: number } | null;
}

interface DealQuote {
  status: string;
  valueCents: number;
}

// Every quote with a value, grouped by deal, so the board can reflect a quote
// the moment it is drafted (FR-1.4) rather than only once it is accepted.
const getQuotesByDeal = async (): Promise<Map<string, DealQuote[]>> => {
  const rows = await db
    .select({
      dealId: quote.dealId,
      status: quote.status,
      valueCents: quote.valueCents,
    })
    .from(quote)
    .where(isNotNull(quote.valueCents));

  const byDeal = new Map<string, DealQuote[]>();
  for (const row of rows) {
    if (row.valueCents == null) {
      continue;
    }
    const list = byDeal.get(row.dealId) ?? [];
    list.push({ status: row.status, valueCents: row.valueCents });
    byDeal.set(row.dealId, list);
  }
  return byDeal;
};

// The figure shown on a card: an accepted quote wins; otherwise the live
// options (declined ones are off the table) collapse to a single value or a
// min–max range. The estimate is the fallback when nothing is quoted. Stage
// totals sum one number per deal, so a range contributes its high end.
const computeDealValue = (
  quotes: DealQuote[],
  estimatedValueCents: number | null
): DealValue => {
  const accepted = quotes.find((item) => item.status === "accepted");
  if (accepted) {
    return { valueCents: accepted.valueCents, valueRange: null };
  }

  const openValues = quotes
    .filter((item) => item.status !== "declined")
    .map((item) => item.valueCents);
  if (openValues.length > 0) {
    const minCents = Math.min(...openValues);
    const maxCents = Math.max(...openValues);
    return {
      valueCents: maxCents,
      valueRange: minCents === maxCents ? null : { maxCents, minCents },
    };
  }

  return { valueCents: estimatedValueCents ?? 0, valueRange: null };
};

// The soonest open follow-up per deal, for the card hover tooltip. Only run
// when the tooltip's follow-up field is actually shown, so the board pays no
// extra query cost when the feature is off.
const getNextFollowUps = async (): Promise<Map<string, NextFollowUp>> => {
  const rows = await db
    .select({
      dealId: followUp.dealId,
      action: followUp.action,
      dueDate: followUp.dueDate,
    })
    .from(followUp)
    .where(isNull(followUp.completedAt))
    .orderBy(asc(followUp.dueDate));

  const byDeal = new Map<string, NextFollowUp>();
  for (const row of rows) {
    // Rows are ascending by due date, so the first seen per deal is soonest.
    if (!byDeal.has(row.dealId)) {
      byDeal.set(row.dealId, {
        action: row.action,
        dueDate: row.dueDate.toISOString(),
      });
    }
  }
  return byDeal;
};

export default async function PipelinePage() {
  const tooltip = await getPipelineTooltipSettings();
  const [allSubStatuses, subStatusPlacement] = await Promise.all([
    getAllSubStatuses(),
    getSubStatusPlacement(),
  ]);
  // Active statuses drive the filter chips and picker; the full set (incl.
  // archived) resolves a deal's current label even after a status is archived.
  const subStatusOptions: DealSubStatusOption[] = allSubStatuses
    .filter((status) => status.archivedAt === null)
    .map(({ id, label, color }) => ({ id, label, color }));
  const subStatusById = new Map(
    allSubStatuses.map((status) => [
      status.id,
      { id: status.id, label: status.label, color: status.color },
    ])
  );

  const stages = await db
    .select({
      id: pipelineStage.id,
      name: pipelineStage.name,
      position: pipelineStage.position,
      isWon: pipelineStage.isWon,
      isLost: pipelineStage.isLost,
    })
    .from(pipelineStage)
    .orderBy(pipelineStage.position);

  const rows = await db
    .select({
      id: deal.id,
      leadId: deal.leadId,
      title: deal.title,
      stageId: deal.stageId,
      estimatedValueCents: deal.estimatedValueCents,
      fixedDate: deal.fixedDate,
      fixedDateType: deal.fixedDateType,
      companyName: company.name,
      ownerName: user.name,
      scopeSummary: deal.scopeSummary,
      lastContactAt: deal.lastContactAt,
      expectedCloseDate: deal.expectedCloseDate,
      subStatusId: deal.subStatusId,
      subStatusNote: deal.subStatusNote,
    })
    .from(deal)
    .leftJoin(company, eq(deal.companyId, company.id))
    .leftJoin(user, eq(deal.ownerId, user.id))
    .where(isNull(deal.deletedAt))
    .orderBy(desc(deal.createdAt));

  const [nextFollowUps, quotesByDeal] = await Promise.all([
    tooltip.enabled && tooltip.followUp
      ? getNextFollowUps()
      : Promise.resolve(new Map<string, NextFollowUp>()),
    getQuotesByDeal(),
  ]);

  const deals = rows.map((row) => {
    const { valueCents, valueRange } = computeDealValue(
      quotesByDeal.get(row.id) ?? [],
      row.estimatedValueCents
    );
    return {
      id: row.id,
      leadId: row.leadId,
      title: row.title,
      stageId: row.stageId,
      valueCents,
      valueRange,
      fixedDate: row.fixedDate?.toISOString() ?? null,
      fixedDateType: row.fixedDateType,
      companyName: row.companyName,
      ownerName: row.ownerName,
      scopeSummary: row.scopeSummary,
      lastContactAt: row.lastContactAt?.toISOString() ?? null,
      expectedCloseDate: row.expectedCloseDate?.toISOString() ?? null,
      subStatus: row.subStatusId
        ? (subStatusById.get(row.subStatusId) ?? null)
        : null,
      subStatusNote: row.subStatusNote,
      nextFollowUp: nextFollowUps.get(row.id) ?? null,
    };
  });

  return (
    <main className="flex h-full flex-col gap-4 py-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4">
        <h1 className="font-semibold text-2xl tracking-tight">Pipeline</h1>
      </div>
      <PipelineBoard
        deals={deals}
        stages={stages}
        subStatusEditable={subStatusPlacement.showOnBoard}
        subStatuses={subStatusOptions}
        tooltip={tooltip}
      />
    </main>
  );
}
