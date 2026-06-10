import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { QuickLogButtons } from "@/components/quick-log-buttons";
import { StageSelect } from "@/components/stage-select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db";
import {
  activity,
  company,
  contact,
  deal,
  pipelineStage,
  user,
} from "@/db/schema";
import {
  formatAudFromCents,
  formatDateAwst,
  formatDateTimeAwst,
} from "@/lib/format";

export const dynamic = "force-dynamic";

const ACTIVITY_LABELS: Record<string, string> = {
  call: "Call",
  email: "Email",
  site_visit: "Site visit",
  meeting: "Meeting",
  note: "Note",
  stage_change: "Stage change",
  quote_event: "Quote",
};

const PROJECT_TYPE_LABELS: Record<string, string> = {
  fit_out: "Fit-out",
  retail_display: "Retail display",
  event_stand: "Event stand",
  exhibition: "Exhibition",
  install: "Install",
  themed_build: "Themed build",
  other: "Other",
};

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [record] = await db
    .select({
      id: deal.id,
      leadId: deal.leadId,
      title: deal.title,
      stageId: deal.stageId,
      stageName: pipelineStage.name,
      estimatedValueCents: deal.estimatedValueCents,
      quotedValueCents: deal.quotedValueCents,
      source: deal.source,
      projectType: deal.projectType,
      venue: deal.venue,
      scopeSummary: deal.scopeSummary,
      fixedDate: deal.fixedDate,
      decisionMakerConfirmed: deal.decisionMakerConfirmed,
      notes: deal.notes,
      companyName: company.name,
      contactId: contact.id,
      contactName: contact.name,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      ownerName: user.name,
      createdAt: deal.createdAt,
    })
    .from(deal)
    .leftJoin(company, eq(deal.companyId, company.id))
    .leftJoin(contact, eq(deal.contactId, contact.id))
    .leftJoin(user, eq(deal.ownerId, user.id))
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(eq(deal.id, id))
    .limit(1);

  if (!record) {
    notFound();
  }

  const stages = await db
    .select({ id: pipelineStage.id, name: pipelineStage.name })
    .from(pipelineStage)
    .orderBy(pipelineStage.position);

  const timeline = await db
    .select({
      id: activity.id,
      type: activity.type,
      content: activity.content,
      createdAt: activity.createdAt,
      authorName: user.name,
    })
    .from(activity)
    .leftJoin(user, eq(activity.createdBy, user.id))
    .where(eq(activity.dealId, id))
    .orderBy(desc(activity.createdAt));

  const valueCents = record.quotedValueCents ?? record.estimatedValueCents;

  const facts = [
    { label: "Company", value: record.companyName },
    {
      label: "Contact",
      value: record.contactName
        ? `${record.contactName}${record.contactEmail ? ` · ${record.contactEmail}` : ""}${record.contactPhone ? ` · ${record.contactPhone}` : ""}`
        : null,
    },
    { label: "Owner", value: record.ownerName ?? "Unassigned" },
    { label: "Source", value: record.source.replace("_", " ") },
    {
      label: "Project type",
      value: record.projectType
        ? PROJECT_TYPE_LABELS[record.projectType]
        : null,
    },
    { label: "Venue / location", value: record.venue },
    {
      label: "Fixed date",
      value: record.fixedDate ? formatDateAwst(record.fixedDate) : null,
    },
    {
      label: "Decision maker confirmed",
      value: record.decisionMakerConfirmed ? "Yes" : "No",
    },
  ].filter((fact) => fact.value);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-muted-foreground text-xs">
          {record.leadId}
        </p>
        <h1 className="font-semibold text-2xl tracking-tight">
          {record.title}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{record.stageName}</Badge>
          {valueCents != null && (
            <span className="font-medium">
              {formatAudFromCents(valueCents)}
            </span>
          )}
        </div>
      </header>

      <StageSelect
        currentStageId={record.stageId}
        dealId={record.id}
        stages={stages}
      />

      <section aria-label="Deal details" className="flex flex-col gap-2">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {facts.map((fact) => (
            <div className="flex flex-col" key={fact.label}>
              <dt className="text-muted-foreground text-xs">{fact.label}</dt>
              <dd className="text-sm">{fact.value}</dd>
            </div>
          ))}
        </dl>
        {record.scopeSummary && (
          <p className="mt-2 text-sm">{record.scopeSummary}</p>
        )}
      </section>

      <Separator />

      <section aria-label="Quick log" className="flex flex-col gap-2">
        <h2 className="font-heading font-medium text-sm">Quick log</h2>
        <QuickLogButtons dealId={record.id} />
      </section>

      <Separator />

      <section aria-label="Timeline" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">Timeline</h2>
        {timeline.length === 0 && (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        )}
        <ol className="flex flex-col gap-3">
          {timeline.map((entry) => (
            <li className="flex flex-col gap-0.5" key={entry.id}>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {ACTIVITY_LABELS[entry.type] ?? entry.type}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {formatDateTimeAwst(entry.createdAt)}
                  {entry.authorName ? ` · ${entry.authorName}` : ""}
                </span>
              </div>
              {entry.content && <p className="text-sm">{entry.content}</p>}
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground text-xs">
          Lead created {formatDateTimeAwst(record.createdAt)}
        </p>
      </section>
    </main>
  );
}
