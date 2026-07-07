"use client";

import {
  ArrowRightIcon,
  CalendarRangeIcon,
  ChevronDownIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { WeeklyReportArtifactData } from "@/lib/ai/stream-protocol";
import {
  formatAudFromCents,
  formatDateAwst,
  formatDayMonthAwst,
} from "@/lib/format";

// Re-export so DataPartsRenderer imports the artifact's data type from here,
// matching the other artifact cards. The type itself lives in the stream
// protocol: it mirrors WeeklyReport (src/lib/reports.ts) with Dates as ISO
// strings.
export type { WeeklyReportArtifactData } from "@/lib/ai/stream-protocol";

type AlertDealData = WeeklyReportArtifactData["closingSoon"][number];
type ReportActionData = WeeklyReportArtifactData["actions"][number];
type ReportDealData = WeeklyReportArtifactData["wonThisWeek"][number];
type StageGroupData = WeeklyReportArtifactData["openByStage"][number];

// House format is DD/MM/YYYY; the card header and action due dates use the
// short DD/MM form to stay compact on a phone.
const formatDayMonth = (iso: string): string =>
  formatDayMonthAwst(new Date(iso));

const formatFullDate = (iso: string): string => formatDateAwst(new Date(iso));

function SectionHeading({ title }: { title: string }) {
  return (
    <h4 className="px-0.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {title}
    </h4>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="px-0.5 text-muted-foreground text-sm">{text}</p>;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md border bg-background p-2">
      <span className="truncate font-semibold text-sm">{value}</span>
      <span className="truncate text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

// One tappable deal row; the trailing slot carries the value or key date.
function DealRow({
  detail,
  id,
  title,
  trailing,
}: {
  detail?: string | null;
  id: string;
  title: string;
  trailing?: string | null;
}) {
  return (
    <li>
      <Link
        className="flex min-h-11 items-center gap-2 rounded-md border bg-background px-3 py-1.5 transition-colors hover:border-blu/50"
        href={`/deals/${id}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">{title}</span>
          {detail ? (
            <span className="block truncate text-muted-foreground text-xs">
              {detail}
            </span>
          ) : null}
        </span>
        {trailing ? (
          <span className="shrink-0 text-muted-foreground text-xs">
            {trailing}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function AlertDealList({
  deals,
  emptyText,
  trailingOf,
}: {
  deals: AlertDealData[];
  emptyText: string;
  trailingOf: (deal: AlertDealData) => string | null;
}) {
  if (deals.length === 0) {
    return <EmptyNote text={emptyText} />;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {deals.map((deal) => (
        <DealRow
          detail={`${deal.leadId} · ${deal.stageName}`}
          id={deal.id}
          key={deal.id}
          title={deal.title}
          trailing={trailingOf(deal)}
        />
      ))}
    </ul>
  );
}

function ReportDealList({
  deals,
  detailOf,
  emptyText,
}: {
  deals: ReportDealData[];
  detailOf?: (deal: ReportDealData) => string | null;
  emptyText: string;
}) {
  if (deals.length === 0) {
    return <EmptyNote text={emptyText} />;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {deals.map((deal) => (
        <DealRow
          detail={detailOf?.(deal) ?? deal.leadId}
          id={deal.id}
          key={deal.id}
          title={deal.title}
          trailing={formatAudFromCents(deal.valueCents)}
        />
      ))}
    </ul>
  );
}

// One pipeline stage with its deal list tucked behind a tap: the count and
// value always read at a glance, the deals expand on demand.
function StageGroup({ group }: { group: StageGroupData }) {
  const { deals, stage } = group;
  return (
    <Collapsible className="rounded-md border bg-background">
      <CollapsibleTrigger className="group/stage flex min-h-11 w-full items-center gap-2 px-3 text-left">
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {stage.stageName}
        </span>
        <span className="shrink-0 text-muted-foreground text-xs">
          {stage.dealCount} deal{stage.dealCount === 1 ? "" : "s"} ·{" "}
          {formatAudFromCents(stage.totalCents)}
        </span>
        <ChevronDownIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/stage:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {deals.length === 0 ? (
          <p className="px-3 pb-2.5 text-muted-foreground text-xs">
            No deals in this stage.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 px-2 pb-2">
            {deals.map((deal) => (
              <DealRow
                detail={deal.leadId}
                id={deal.id}
                key={deal.id}
                title={deal.title}
                trailing={formatAudFromCents(deal.valueCents)}
              />
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ActionRow({ action }: { action: ReportActionData }) {
  return (
    <li>
      <Link
        className="flex min-h-11 items-center gap-2 rounded-md border bg-background px-3 py-1.5 transition-colors hover:border-blu/50"
        href={`/deals/${action.dealId}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">
            {action.action}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {action.dealTitle} · {action.ownerName ?? "Unassigned"}
          </span>
        </span>
        <span className="shrink-0 text-muted-foreground text-xs">
          due {formatDayMonth(action.dueDate)}
        </span>
      </Link>
    </li>
  );
}

// Compact in-chat rendering of the weekly pipeline report (same numbers as
// /reports/weekly, same seven sections, phone-first density).
export function WeeklyReportArtifact({
  data,
}: {
  data: WeeklyReportArtifactData;
}) {
  return (
    <section
      aria-label="Weekly pipeline report"
      className="my-2 flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm"
    >
      <div>
        <h3 className="flex items-center gap-1.5 font-medium text-sm">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
            <CalendarRangeIcon aria-hidden className="size-3" />
          </span>
          Weekly pipeline report
        </h3>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {formatDayMonth(data.weekStart)} to {formatDayMonth(data.generatedAt)}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionHeading title="Summary" />
        <div className="grid grid-cols-3 gap-1.5">
          <SummaryStat
            label="Active leads"
            value={String(data.totals.openCount)}
          />
          <SummaryStat
            label="Weighted value"
            value={formatAudFromCents(data.totals.weightedTotalCents)}
          />
          <SummaryStat label="New" value={String(data.newThisWeek)} />
          <SummaryStat label="Won" value={String(data.wonThisWeek.length)} />
          <SummaryStat
            label="Lost / dormant"
            value={String(data.lostThisWeek.length)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionHeading
          title={`Closing soon (within ${data.closingSoonDays} days)`}
        />
        <AlertDealList
          deals={data.closingSoon}
          emptyText={`Nothing closing in the next ${data.closingSoonDays} days.`}
          trailingOf={(deal) => {
            const keyDate = deal.fixedDate ?? deal.expectedCloseDate;
            return keyDate ? formatFullDate(keyDate) : null;
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionHeading
          title={`Needs attention (no contact ${data.staleDays}+ days)`}
        />
        <AlertDealList
          deals={data.needsAttention}
          emptyText="Nothing needs attention right now."
          trailingOf={(deal) => {
            const lastContact = deal.lastContactAt ?? deal.createdAt;
            return `last ${formatFullDate(lastContact)}`;
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionHeading title="Full pipeline by stage" />
        {data.openByStage.length === 0 ? (
          <EmptyNote text="No open deals in the pipeline." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.openByStage.map((group) => (
              <StageGroup group={group} key={group.stage.stageId} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionHeading title="Won this week" />
        <ReportDealList
          deals={data.wonThisWeek}
          emptyText="No deals won this week."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionHeading title="Lost / dormant this week" />
        <ReportDealList
          deals={data.lostThisWeek}
          detailOf={(deal) =>
            deal.lostReason ? `Reason: ${deal.lostReason}` : deal.leadId
          }
          emptyText="No deals lost this week."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionHeading title="Actions for the week" />
        {data.actions.length === 0 ? (
          <EmptyNote text="No actions logged for this week." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.actions.map((action) => (
              <ActionRow action={action} key={action.id} />
            ))}
          </ul>
        )}
      </div>

      <Link
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-md border font-medium text-blu text-sm transition-colors hover:border-blu/50"
        href="/reports/weekly"
      >
        Open full report
        <ArrowRightIcon aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
