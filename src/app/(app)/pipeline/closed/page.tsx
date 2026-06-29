import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import {
  type ClosedDeal,
  ClosedDealsList,
} from "@/components/closed-deals-list";
import { db } from "@/db";
import { company, deal, pipelineStage, user } from "@/db/schema";
import { computeDealValue, getQuotesByDeal } from "@/lib/deal-values";

export const dynamic = "force-dynamic";

interface StageMeta {
  name: string;
  outcome: "won" | "lost";
}

const isOutcomeParam = (value: string | undefined): value is "won" | "lost" =>
  value === "won" || value === "lost";

export default async function ClosedDealsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const initialOutcome = isOutcomeParam(stage) ? stage : "all";

  const closedStages = await db
    .select({
      id: pipelineStage.id,
      name: pipelineStage.name,
      isWon: pipelineStage.isWon,
    })
    .from(pipelineStage)
    .where(or(eq(pipelineStage.isWon, true), eq(pipelineStage.isLost, true)));

  const stageMeta = new Map<string, StageMeta>(
    closedStages.map((row) => [
      row.id,
      { name: row.name, outcome: row.isWon ? "won" : "lost" },
    ])
  );
  const closedStageIds = closedStages.map((row) => row.id);

  // No closed stages configured means nothing to show; skip the deal query.
  if (closedStageIds.length === 0) {
    return (
      <ClosedDealsPageShell>
        <ClosedDealsList deals={[]} initialOutcome={initialOutcome} />
      </ClosedDealsPageShell>
    );
  }

  const [rows, quotesByDeal] = await Promise.all([
    db
      .select({
        id: deal.id,
        leadId: deal.leadId,
        title: deal.title,
        stageId: deal.stageId,
        estimatedValueCents: deal.estimatedValueCents,
        companyName: company.name,
        ownerName: user.name,
        closedAt: deal.closedAt,
        updatedAt: deal.updatedAt,
        lostReason: deal.lostReason,
      })
      .from(deal)
      .leftJoin(company, eq(deal.companyId, company.id))
      .leftJoin(user, eq(deal.ownerId, user.id))
      .where(and(isNull(deal.deletedAt), inArray(deal.stageId, closedStageIds)))
      // Newest first; legacy rows missing closedAt fall back to updatedAt.
      .orderBy(sql`coalesce(${deal.closedAt}, ${deal.updatedAt}) desc`),
    getQuotesByDeal(),
  ]);

  const deals: ClosedDeal[] = rows.map((row) => {
    const { valueCents } = computeDealValue(
      quotesByDeal.get(row.id) ?? [],
      row.estimatedValueCents
    );
    const meta = stageMeta.get(row.stageId);
    return {
      id: row.id,
      leadId: row.leadId,
      title: row.title,
      companyName: row.companyName,
      ownerName: row.ownerName,
      valueCents,
      outcome: meta?.outcome ?? "lost",
      lostReason: row.lostReason,
      closedAt: (row.closedAt ?? row.updatedAt)?.toISOString() ?? null,
    };
  });

  return (
    <ClosedDealsPageShell>
      <ClosedDealsList deals={deals} initialOutcome={initialOutcome} />
    </ClosedDealsPageShell>
  );
}

function ClosedDealsPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-full flex-col gap-4 py-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4">
        <h1 className="font-semibold text-2xl tracking-tight">Closed deals</h1>
        <Link
          className="text-muted-foreground text-sm transition-colors hover:text-foreground"
          href="/pipeline"
        >
          Back to pipeline
        </Link>
      </div>
      {children}
    </main>
  );
}
