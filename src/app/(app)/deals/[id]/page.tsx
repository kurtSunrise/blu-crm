import { and, asc, desc, eq, isNull } from "drizzle-orm";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AttachmentUpload } from "@/components/attachment-upload";
import { CompleteFollowUpButton } from "@/components/complete-follow-up-button";
import { FollowUpForm } from "@/components/follow-up-form";
import { QuickLogButtons } from "@/components/quick-log-buttons";
import { QuoteForm } from "@/components/quote-form";
import { QuoteRowActions } from "@/components/quote-row-actions";
import { StageSelect } from "@/components/stage-select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db";
import {
  activity,
  attachment,
  company,
  contact,
  deal,
  followUp,
  pipelineStage,
  quote,
  user,
} from "@/db/schema";
import {
  formatAudFromCents,
  formatDateAwst,
  formatDateTimeAwst,
} from "@/lib/format";
import { LOST_REASON_LABELS, PROJECT_TYPE_LABELS } from "@/lib/labels";
import { isImageType } from "@/lib/validation/attachment";

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

const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
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
      expectedCloseDate: deal.expectedCloseDate,
      lostReason: deal.lostReason,
      handoverToDelivery: deal.handoverToDelivery,
      stageIsWon: pipelineStage.isWon,
      notes: deal.notes,
      ownerId: deal.ownerId,
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
    .select({
      id: pipelineStage.id,
      name: pipelineStage.name,
      isWon: pipelineStage.isWon,
      isLost: pipelineStage.isLost,
    })
    .from(pipelineStage)
    .orderBy(pipelineStage.position);

  const users = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .orderBy(asc(user.name));

  const openFollowUps = await db
    .select({
      id: followUp.id,
      action: followUp.action,
      dueDate: followUp.dueDate,
      ownerName: user.name,
    })
    .from(followUp)
    .leftJoin(user, eq(followUp.ownerId, user.id))
    .where(and(eq(followUp.dealId, id), isNull(followUp.completedAt)))
    .orderBy(asc(followUp.dueDate));

  const quotes = await db
    .select({
      id: quote.id,
      valueCents: quote.valueCents,
      status: quote.status,
      viewToken: quote.viewToken,
      sentAt: quote.sentAt,
      viewedAt: quote.viewedAt,
      createdAt: quote.createdAt,
    })
    .from(quote)
    .where(eq(quote.dealId, id))
    .orderBy(desc(quote.createdAt));

  const attachments = await db
    .select({
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      createdAt: attachment.createdAt,
    })
    .from(attachment)
    .where(eq(attachment.dealId, id))
    .orderBy(desc(attachment.createdAt));

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
    {
      label: "Expected close",
      value: record.expectedCloseDate
        ? formatDateAwst(record.expectedCloseDate)
        : null,
    },
    {
      label: "Lost reason",
      value: record.lostReason ? LOST_REASON_LABELS[record.lostReason] : null,
    },
  ].filter((fact) => fact.value);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 lg:max-w-6xl">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-muted-foreground text-xs">
          {record.leadId}
        </p>
        <h1 className="font-semibold text-2xl tracking-tight">
          {record.title}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{record.stageName}</Badge>
          {record.stageIsWon && record.handoverToDelivery && (
            <Badge>Handover to delivery</Badge>
          )}
          {valueCents != null && (
            <span className="font-medium">
              {formatAudFromCents(valueCents)}
            </span>
          )}
        </div>
      </header>

      {/* Desktop: record on the left, timeline alongside on the right. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-5">
          <StageSelect
            currentStageId={record.stageId}
            dealId={record.id}
            stages={stages}
          />

          <section aria-label="Deal details" className="flex flex-col gap-2">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {facts.map((fact) => (
                <div className="flex flex-col" key={fact.label}>
                  <dt className="text-muted-foreground text-xs">
                    {fact.label}
                  </dt>
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

          <section aria-label="Follow-ups" className="flex flex-col gap-3">
            <h2 className="font-heading font-medium text-sm">Follow-ups</h2>
            {openFollowUps.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No next action set. Every open deal should carry one.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {openFollowUps.map((item) => (
                  <li
                    className="flex items-center gap-3 rounded-lg border bg-card p-3"
                    key={item.id}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{item.action}</p>
                      <p className="text-muted-foreground text-xs">
                        Due {formatDateAwst(item.dueDate)}
                        {item.ownerName ? ` · ${item.ownerName}` : ""}
                      </p>
                    </div>
                    <CompleteFollowUpButton
                      action={item.action}
                      followUpId={item.id}
                    />
                  </li>
                ))}
              </ul>
            )}
            <FollowUpForm
              dealId={record.id}
              defaultOwnerId={record.ownerId}
              users={users}
            />
          </section>

          <Separator />

          <section aria-label="Quotes" className="flex flex-col gap-3">
            <h2 className="font-heading font-medium text-sm">Quotes</h2>
            {quotes.length === 0 ? (
              <p className="text-muted-foreground text-sm">No quotes yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {quotes.map((item) => (
                  <li
                    className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3"
                    key={item.id}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">
                        {item.valueCents == null
                          ? "No value"
                          : formatAudFromCents(item.valueCents)}
                        {"  "}
                        <Badge variant="outline">
                          {QUOTE_STATUS_LABELS[item.status] ?? item.status}
                        </Badge>
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {item.sentAt
                          ? `Sent ${formatDateAwst(item.sentAt)}`
                          : ""}
                        {item.viewedAt
                          ? ` · Viewed ${formatDateAwst(item.viewedAt)}`
                          : ""}
                      </p>
                      {item.viewToken && (
                        <a
                          className="text-blu text-xs underline underline-offset-2"
                          href={`/q/${item.viewToken}`}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Client view link
                        </a>
                      )}
                    </div>
                    <QuoteRowActions quoteId={item.id} status={item.status} />
                  </li>
                ))}
              </ul>
            )}
            <QuoteForm dealId={record.id} />
          </section>

          <Separator />

          <section
            aria-label="Files and photos"
            className="flex flex-col gap-3"
          >
            <h2 className="font-heading font-medium text-sm">
              Files and photos
            </h2>
            {attachments.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {attachments.map((item) => (
                  <li key={item.id}>
                    <a
                      className="block"
                      href={`/api/attachments/${item.id}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {isImageType(item.contentType) ? (
                        // Streamed through the private app route, so the
                        // image is served unoptimised.
                        <Image
                          alt={item.fileName}
                          className="aspect-square w-full rounded-md border object-cover"
                          height={300}
                          src={`/api/attachments/${item.id}`}
                          unoptimized
                          width={300}
                        />
                      ) : (
                        <span className="flex aspect-square w-full items-center justify-center break-all rounded-md border bg-card p-2 text-center text-muted-foreground text-xs">
                          {item.fileName}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <AttachmentUpload dealId={record.id} />
          </section>
        </div>

        <Separator className="lg:hidden" />

        <section
          aria-label="Timeline"
          className="flex flex-col gap-3 lg:rounded-lg lg:border lg:bg-card/50 lg:p-4"
        >
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
      </div>
    </main>
  );
}
