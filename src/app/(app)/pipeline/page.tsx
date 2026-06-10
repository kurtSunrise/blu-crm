import { desc, eq, isNull } from "drizzle-orm";
import { PipelineBoard } from "@/components/pipeline-board";
import { db } from "@/db";
import { company, deal, pipelineStage, user } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
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
      quotedValueCents: deal.quotedValueCents,
      fixedDate: deal.fixedDate,
      companyName: company.name,
      ownerName: user.name,
    })
    .from(deal)
    .leftJoin(company, eq(deal.companyId, company.id))
    .leftJoin(user, eq(deal.ownerId, user.id))
    .where(isNull(deal.deletedAt))
    .orderBy(desc(deal.createdAt));

  const deals = rows.map((row) => ({
    id: row.id,
    leadId: row.leadId,
    title: row.title,
    stageId: row.stageId,
    // Quoted value wins over the estimate where a quote exists (FR-1.4 AC)
    valueCents: row.quotedValueCents ?? row.estimatedValueCents ?? 0,
    fixedDate: row.fixedDate?.toISOString() ?? null,
    companyName: row.companyName,
    ownerName: row.ownerName,
  }));

  return (
    <main className="flex h-full flex-col gap-4 py-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4">
        <h1 className="font-semibold text-2xl tracking-tight">Pipeline</h1>
      </div>
      <PipelineBoard deals={deals} stages={stages} />
    </main>
  );
}
