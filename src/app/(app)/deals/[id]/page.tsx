import { and, asc, desc, eq, isNull } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AiEntityBeacon } from "@/components/ai/ai-entity-beacon";
import { AskAiButton } from "@/components/ai/ask-ai-button";
import { DealChatsList } from "@/components/ai/deal-chats-list";
import { AttachmentDeleteButton } from "@/components/attachment-delete-button";
import { AttachmentUpload } from "@/components/attachment-upload";
import { CompleteFollowUpButton } from "@/components/complete-follow-up-button";
import { DealSubStatusControl } from "@/components/deal-sub-status-control";
import { DealTimeline } from "@/components/deal-timeline";
import { FollowUpForm } from "@/components/follow-up-form";
import { NoteComposer } from "@/components/note-composer";
import { PageHeader } from "@/components/page-header";
import { QuickLogButtons } from "@/components/quick-log-buttons";
import { QuoteForm } from "@/components/quote-form";
import { QuoteRowActions } from "@/components/quote-row-actions";
import { SharedFolderLink } from "@/components/shared-folder-link";
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
import { listDealThreadsForUser, type ThreadListItem } from "@/lib/ai/threads";
import { awstMonthKey } from "@/lib/calendar";
import {
  awstDayDiff,
  formatAudFromCents,
  formatDateAwst,
  formatRelativeDayAwst,
  relativeDayLabel,
} from "@/lib/format";
import {
  type DealSubStatusOption,
  FIXED_DATE_TYPE_LABELS,
  type FixedDateType,
  LOST_REASON_LABELS,
  PROJECT_TYPE_LABELS,
} from "@/lib/labels";
import { getSessionUserId } from "@/lib/session";
import {
  getActiveSubStatuses,
  getSubStatusById,
  getSubStatusPlacement,
} from "@/lib/sub-statuses";
import { cn } from "@/lib/utils";
import { isImageType } from "@/lib/validation/attachment";

export const dynamic = "force-dynamic";

const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
};

interface KeyDate {
  accentClass: string;
  date: Date;
  href?: string;
  key: string;
  label: string;
}

// The dates that decide how busy the team is, surfaced ahead of the facts.
function buildKeyDates(
  record: {
    expectedCloseDate: Date | null;
    fixedDate: Date | null;
    fixedDateType: FixedDateType | null;
  },
  nextFollowUpDue: Date | undefined
): KeyDate[] {
  const keyDates: KeyDate[] = [];
  if (record.fixedDate) {
    keyDates.push({
      key: "fixed",
      label: record.fixedDateType
        ? FIXED_DATE_TYPE_LABELS[record.fixedDateType]
        : "Fixed date",
      date: record.fixedDate,
      accentClass: "text-warning",
      href: `/calendar?month=${awstMonthKey(record.fixedDate)}`,
    });
  }
  if (record.expectedCloseDate) {
    keyDates.push({
      key: "close",
      label: "Expected close",
      date: record.expectedCloseDate,
      accentClass: "text-blu",
      href: `/calendar?month=${awstMonthKey(record.expectedCloseDate)}`,
    });
  }
  if (nextFollowUpDue) {
    keyDates.push({
      key: "follow-up",
      label: "Next follow-up",
      date: nextFollowUpDue,
      accentClass: "text-success",
    });
  }
  return keyDates;
}

// Company and contact names link through to their pages (FR-2).
function buildFacts(record: {
  companyId: string | null;
  companyName: string | null;
  contactEmail: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  decisionMakerConfirmed: boolean;
  lostReason: keyof typeof LOST_REASON_LABELS | null;
  ownerName: string | null;
  projectType: keyof typeof PROJECT_TYPE_LABELS | null;
  source: string;
  venue: string | null;
}): { label: string; value: React.ReactNode }[] {
  return [
    {
      label: "Company",
      value:
        record.companyId && record.companyName ? (
          <Link
            className="text-blu underline underline-offset-2"
            href={`/companies/${record.companyId}`}
          >
            {record.companyName}
          </Link>
        ) : (
          record.companyName
        ),
    },
    {
      label: "Contact",
      value: record.contactName ? (
        <>
          {record.contactId ? (
            <Link
              className="text-blu underline underline-offset-2"
              href={`/contacts/${record.contactId}`}
            >
              {record.contactName}
            </Link>
          ) : (
            record.contactName
          )}
          {record.contactEmail ? ` · ${record.contactEmail}` : ""}
          {record.contactPhone ? ` · ${record.contactPhone}` : ""}
        </>
      ) : null,
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
      label: "Decision maker confirmed",
      value: record.decisionMakerConfirmed ? "Yes" : "No",
    },
    {
      label: "Lost reason",
      value: record.lostReason ? LOST_REASON_LABELS[record.lostReason] : null,
    },
  ].filter((fact) => fact.value);
}

function KeyDateTile({
  label,
  date,
  accentClass,
  href,
}: {
  label: string;
  date: Date;
  accentClass: string;
  href?: string;
}) {
  const dayDiff = awstDayDiff(date);
  const body = (
    <>
      <span className={cn("flex items-center gap-1.5 text-xs", accentClass)}>
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        {label}
      </span>
      <span className="font-medium text-sm">{formatDateAwst(date)}</span>
      <span
        className={cn(
          "text-xs",
          dayDiff < 0 ? "font-medium text-destructive" : "text-muted-foreground"
        )}
      >
        {relativeDayLabel(dayDiff)}
      </span>
    </>
  );
  const tileClass =
    "flex min-w-36 flex-col gap-0.5 rounded-lg border bg-card px-3 py-2";

  if (href) {
    return (
      <Link
        className={cn(tileClass, "transition-colors hover:border-blu")}
        href={href}
      >
        {body}
      </Link>
    );
  }
  return <div className={tileClass}>{body}</div>;
}

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The viewer id (for their deal-linked chats) is independent of the deal
  // record, so resolve it in the same wave rather than adding a serial await.
  const [dealRows, viewerId] = await Promise.all([
    db
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
        fixedDateType: deal.fixedDateType,
        decisionMakerConfirmed: deal.decisionMakerConfirmed,
        expectedCloseDate: deal.expectedCloseDate,
        lostReason: deal.lostReason,
        subStatusId: deal.subStatusId,
        subStatusNote: deal.subStatusNote,
        handoverToDelivery: deal.handoverToDelivery,
        stageIsWon: pipelineStage.isWon,
        notes: deal.notes,
        sharedFolderUrl: deal.sharedFolderUrl,
        ownerId: deal.ownerId,
        companyId: company.id,
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
      .limit(1),
    getSessionUserId(),
  ]);

  const [record] = dealRows;
  if (!record) {
    notFound();
  }

  // The remaining reads are independent of each other, so run them in a single
  // parallel wave rather than sequentially. On the Cloudflare worker each Neon
  // query is a separate HTTP round-trip; issuing ~9 of them back-to-back made
  // the render slow enough to intermittently exceed the runtime's limits and
  // return a 503 (notably on the server-action re-render after adding a note),
  // which is why in-place updates failed until a manual reload.
  const [
    subStatusOptions,
    subStatusPlacement,
    currentSubStatus,
    stages,
    users,
    openFollowUps,
    quotes,
    attachments,
    timeline,
    dealThreads,
  ] = await Promise.all([
    getActiveSubStatuses(),
    getSubStatusPlacement(),
    record.subStatusId
      ? getSubStatusById(record.subStatusId)
      : Promise.resolve<DealSubStatusOption | null>(null),
    db
      .select({
        id: pipelineStage.id,
        name: pipelineStage.name,
        isWon: pipelineStage.isWon,
        isLost: pipelineStage.isLost,
      })
      .from(pipelineStage)
      .orderBy(pipelineStage.position),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .orderBy(asc(user.name)),
    db
      .select({
        id: followUp.id,
        action: followUp.action,
        dueDate: followUp.dueDate,
        ownerName: user.name,
      })
      .from(followUp)
      .leftJoin(user, eq(followUp.ownerId, user.id))
      .where(and(eq(followUp.dealId, id), isNull(followUp.completedAt)))
      .orderBy(asc(followUp.dueDate)),
    db
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
      .orderBy(desc(quote.createdAt)),
    db
      .select({
        id: attachment.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        createdAt: attachment.createdAt,
      })
      .from(attachment)
      .where(eq(attachment.dealId, id))
      .orderBy(desc(attachment.createdAt)),
    db
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
      .orderBy(desc(activity.createdAt)),
    viewerId
      ? listDealThreadsForUser(viewerId, id)
      : Promise.resolve<ThreadListItem[]>([]),
  ]);

  const valueCents = record.quotedValueCents ?? record.estimatedValueCents;

  const facts = buildFacts(record);

  const keyDates = buildKeyDates(record, openFollowUps[0]?.dueDate);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-4 md:py-6 lg:max-w-6xl">
      <AiEntityBeacon
        dealId={record.id}
        label={`${record.leadId} · ${record.title}`}
      />
      <PageHeader
        backHref="/pipeline"
        backLabel="Back to pipeline"
        eyebrow={
          <p className="font-mono text-muted-foreground text-xs">
            {record.leadId}
          </p>
        }
        title={record.title}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{record.stageName}</Badge>
          {record.stageIsWon && record.handoverToDelivery && (
            <Badge>Handover to delivery</Badge>
          )}
          {valueCents != null && (
            <span className="font-medium">
              {formatAudFromCents(valueCents)}
            </span>
          )}
          <DealSubStatusControl
            current={currentSubStatus}
            dealId={record.id}
            editable={subStatusPlacement.showOnDealPage}
            note={record.subStatusNote}
            options={subStatusOptions}
          />
          <AskAiButton
            prompt={`Summarise deal ${record.leadId} and suggest the next action`}
          />
        </div>
      </PageHeader>

      {keyDates.length > 0 && (
        <section aria-label="Key dates" className="flex flex-wrap gap-2">
          {keyDates.map((tile) => (
            <KeyDateTile
              accentClass={tile.accentClass}
              date={tile.date}
              href={tile.href}
              key={tile.key}
              label={tile.label}
            />
          ))}
        </section>
      )}

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
            <div className="mt-2">
              <SharedFolderLink
                dealId={record.id}
                url={record.sharedFolderUrl}
              />
            </div>
          </section>

          <Separator />

          <section
            aria-label="Updates and notes"
            className="flex flex-col gap-3"
          >
            <h2 className="font-heading font-medium text-sm">
              Updates &amp; notes
            </h2>
            <QuickLogButtons dealId={record.id} />
            <NoteComposer dealId={record.id} />
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
                {openFollowUps.map((item) => {
                  const overdue = awstDayDiff(item.dueDate) < 0;
                  return (
                    <li
                      className={cn(
                        "flex items-center gap-3 rounded-lg border bg-card p-3",
                        overdue && "border-destructive/60"
                      )}
                      key={item.id}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{item.action}</p>
                        <p className="text-muted-foreground text-xs">
                          {"Due "}
                          <span
                            className={cn(
                              overdue && "font-medium text-destructive"
                            )}
                          >
                            {formatDateAwst(item.dueDate)} ·{" "}
                            {formatRelativeDayAwst(item.dueDate)}
                          </span>
                          {item.ownerName ? ` · ${item.ownerName}` : ""}
                        </p>
                      </div>
                      <CompleteFollowUpButton
                        action={item.action}
                        followUpId={item.id}
                      />
                    </li>
                  );
                })}
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
            aria-label="AI conversations"
            className="flex flex-col gap-3"
          >
            <h2 className="font-heading font-medium text-sm">
              AI conversations
            </h2>
            <DealChatsList threads={dealThreads} />
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
                  <li className="relative" key={item.id}>
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
                    <AttachmentDeleteButton
                      attachmentId={item.id}
                      fileName={item.fileName}
                    />
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
            <p className="text-muted-foreground text-sm">
              No activity yet. Log the first call or note below.
            </p>
          )}
          <DealTimeline entries={timeline} leadCreatedAt={record.createdAt} />
        </section>
      </div>
    </main>
  );
}
