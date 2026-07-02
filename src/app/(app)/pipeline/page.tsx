import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import Link from "next/link";
import { PipelineBoard } from "@/components/pipeline-board";
import { db } from "@/db";
import { company, deal, followUp, pipelineStage, user } from "@/db/schema";
import { computeDealValue, getQuotesByDeal } from "@/lib/deal-values";
import { MS_PER_DAY } from "@/lib/format";
import type { DealSubStatusOption } from "@/lib/labels";
import { getPipelineTooltipSettings } from "@/lib/pipeline-tooltip";
import { getAllSubStatuses, getSubStatusPlacement } from "@/lib/sub-statuses";

export const dynamic = "force-dynamic";

// Closed (Won / Lost) deals pile up forever, so the board only loads those
// closed within this window. Active deals are always loaded regardless of age.
// The full history lives at /pipeline/closed.
const CLOSED_WINDOW_DAYS = 60;

interface NextFollowUp {
  action: string;
  dueDate: string;
}

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

  // Keep every active deal, but only closed deals from the recent window so the
  // Won / Lost columns cannot grow without bound. A closed deal's age is its
  // closedAt, falling back to updatedAt for any legacy row closed before that
  // field was stamped.
  const closedStageIds = stages
    .filter((stage) => stage.isWon || stage.isLost)
    .map((stage) => stage.id);
  const closedCutoff = new Date(Date.now() - CLOSED_WINDOW_DAYS * MS_PER_DAY);
  const dealFilters: SQL[] = [isNull(deal.deletedAt)];
  if (closedStageIds.length > 0) {
    const recentlyClosed = or(
      notInArray(deal.stageId, closedStageIds),
      gte(sql`coalesce(${deal.closedAt}, ${deal.updatedAt})`, closedCutoff)
    );
    if (recentlyClosed) {
      dealFilters.push(recentlyClosed);
    }
  }

  const rows = await db
    .select({
      id: deal.id,
      leadId: deal.leadId,
      title: deal.title,
      stageId: deal.stageId,
      estimatedValueCents: deal.estimatedValueCents,
      estimatedValueMaxCents: deal.estimatedValueMaxCents,
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
    .where(and(...dealFilters))
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
      row.estimatedValueCents,
      row.estimatedValueMaxCents
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
        <Link
          className="text-muted-foreground text-sm transition-colors hover:text-foreground"
          href="/pipeline/closed"
        >
          Closed deals
        </Link>
      </div>
      <PipelineBoard
        closedWindowDays={CLOSED_WINDOW_DAYS}
        deals={deals}
        stages={stages}
        subStatusEditable={subStatusPlacement.showOnBoard}
        subStatuses={subStatusOptions}
        tooltip={tooltip}
      />
    </main>
  );
}
