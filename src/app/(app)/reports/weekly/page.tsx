import Link from "next/link";
import { AskAiButton } from "@/components/ai/ask-ai-button";
import { CopyReportButton } from "@/components/copy-report-button";
import { PageHeader } from "@/components/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";
import { Badge } from "@/components/ui/badge";
import type { AlertDeal } from "@/lib/alerts";
import { formatAudFromCents, formatDateAwst } from "@/lib/format";
import {
  getWeeklyReport,
  type ReportDealRow,
  renderWeeklyReportText,
} from "@/lib/reports";

export const dynamic = "force-dynamic";

function ReportSection({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="font-heading font-medium text-sm">
        {number}. {title}
      </h2>
      {children}
    </section>
  );
}

function DealList({
  deals,
  detail,
}: {
  deals: ReportDealRow[];
  detail?: (row: ReportDealRow) => string | null;
}) {
  if (deals.length === 0) {
    return <p className="text-muted-foreground text-sm">None.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {deals.map((row) => {
        const extra = detail?.(row);
        return (
          <li key={row.id}>
            <Link
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
              href={`/deals/${row.id}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{row.title}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {row.leadId} · {row.companyName ?? "No company"}
                  {extra ? ` · ${extra}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm">
                {formatAudFromCents(row.valueCents)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function AlertList({ deals }: { deals: AlertDeal[] }) {
  if (deals.length === 0) {
    return <p className="text-muted-foreground text-sm">None.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {deals.map((row) => {
        const keyDate = row.fixedDate ?? row.expectedCloseDate;
        return (
          <li key={row.id}>
            <Link
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
              href={`/deals/${row.id}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{row.title}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {row.leadId} · {row.companyName ?? "No company"}
                  {keyDate ? ` · date ${formatDateAwst(keyDate)}` : ""}
                  {` · last contact ${formatDateAwst(row.lastContactAt ?? row.createdAt)}`}
                </p>
              </div>
              <Badge variant="secondary">{row.stageName}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <span className="font-semibold text-xl">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

export default async function WeeklyReportPage() {
  const report = await getWeeklyReport();
  const reportText = renderWeeklyReportText(report);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <PageHeader
        actions={
          <>
            <AskAiButton prompt="Give me this week's pipeline report" />
            <CopyReportButton text={reportText} />
          </>
        }
        subtitle={
          <p>
            {formatDateAwst(report.weekStart)} to{" "}
            {formatDateAwst(report.generatedAt)} · numbers match{" "}
            <Link className="underline underline-offset-2" href="/reports">
              Reports
            </Link>{" "}
            for the same period · Private and Confidential
          </p>
        }
        title="Weekly Pipeline Report"
      />

      <ReportsNav active="/reports/weekly" />

      <ReportSection number={1} title="Summary">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SummaryStat
            label="Active leads"
            value={String(report.totals.openCount)}
          />
          <SummaryStat
            label="Open pipeline"
            value={formatAudFromCents(report.totals.openTotalCents)}
          />
          <SummaryStat
            label="Weighted value"
            value={formatAudFromCents(report.totals.weightedTotalCents)}
          />
          <SummaryStat
            label="New this week"
            value={String(report.newThisWeek)}
          />
          <SummaryStat
            label="Won this week"
            value={String(report.wonThisWeek.length)}
          />
          <SummaryStat
            label="Lost / dormant"
            value={String(report.lostThisWeek.length)}
          />
        </div>
      </ReportSection>

      <ReportSection
        number={2}
        title={`Closing soon (within ${report.closingSoonDays} days)`}
      >
        <AlertList deals={report.closingSoon} />
      </ReportSection>

      <ReportSection
        number={3}
        title={`Needs attention (no contact ${report.staleDays}+ days)`}
      >
        <AlertList deals={report.needsAttention} />
      </ReportSection>

      <ReportSection number={4} title="Full pipeline by stage">
        <div className="flex flex-col gap-4">
          {report.openByStage.map(({ stage, deals }) => (
            <div className="flex flex-col gap-2" key={stage.stageId}>
              <p className="text-muted-foreground text-xs">
                {stage.stageName} · {stage.dealCount} deal
                {stage.dealCount === 1 ? "" : "s"},{" "}
                {formatAudFromCents(stage.totalCents)}
              </p>
              <DealList deals={deals} />
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection number={5} title="Won this week">
        <DealList
          deals={report.wonThisWeek}
          detail={(row) =>
            row.handoverToDelivery
              ? "handed over to delivery"
              : "handover pending"
          }
        />
      </ReportSection>

      <ReportSection number={6} title="Lost / dormant this week">
        <DealList
          deals={report.lostThisWeek}
          detail={(row) =>
            row.lostReason ? `reason: ${row.lostReason}` : null
          }
        />
      </ReportSection>

      <ReportSection number={7} title="Actions for the week">
        {report.actions.length === 0 ? (
          <p className="text-muted-foreground text-sm">None.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.actions.map((row) => (
              <li key={row.id}>
                <Link
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                  href={`/deals/${row.dealId}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{row.action}</p>
                    <p className="truncate text-muted-foreground text-xs">
                      {row.dealTitle}
                      {row.ownerName ? ` · ${row.ownerName}` : " · Unassigned"}
                    </p>
                  </div>
                  <span className="shrink-0 text-muted-foreground text-sm">
                    due {formatDateAwst(row.dueDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>
    </main>
  );
}
