import { NextResponse } from "next/server";
import { awstDateKey } from "@/lib/calendar";
import { type CsvValue, toCsv } from "@/lib/csv";
import {
  getClosedTrend,
  getCreatedTrend,
  getForecastByMonth,
  getReportDeals,
  getStageBreakdown,
  getWinRate,
  parseReportFilters,
  type ReportFilters,
  trendBucketFor,
  trendBucketKeys,
} from "@/lib/reports";
import { getSessionUserId } from "@/lib/session";

// CSV export for the report surfaces. Every dataset is produced by the SAME
// query functions the pages render from (src/lib/reports.ts), so an exported
// figure always matches the on-screen one.

const CENTS_PER_DOLLAR = 100;

const dollars = (cents: number): number => cents / CENTS_PER_DOLLAR;

const dateKey = (date: Date | null): string | null =>
  date ? awstDateKey(date) : null;

interface CsvDataset {
  headers: string[];
  rows: CsvValue[][];
}

const pipelineCsv = async (filters: ReportFilters): Promise<CsvDataset> => {
  const breakdown = await getStageBreakdown(filters);
  return {
    headers: [
      "Stage",
      "Deals",
      "Value (AUD)",
      "Weighting (%)",
      "Weighted value (AUD)",
    ],
    rows: breakdown.map((row) => [
      row.stageName,
      row.dealCount,
      dollars(row.totalCents),
      row.weighting,
      dollars(row.weightedCents),
    ]),
  };
};

const winRateCsv = async (filters: ReportFilters): Promise<CsvDataset> => {
  const winRate = await getWinRate(filters.from, filters);
  const rows: CsvValue[][] = [
    ["Won", winRate.wonCount],
    ["Won value (AUD)", dollars(winRate.wonValueCents)],
    ["Lost / dormant", winRate.lostCount],
    [
      "Win rate (%)",
      winRate.winRatePercent === null ? null : winRate.winRatePercent,
    ],
    ...winRate.lostReasons.map((reason): CsvValue[] => [
      `Lost: ${reason.label}`,
      reason.count,
    ]),
  ];
  return { headers: ["Metric", "Value"], rows };
};

const trendsCsv = async (filters: ReportFilters): Promise<CsvDataset> => {
  const bucket = trendBucketFor(filters);
  const [created, closed] = await Promise.all([
    getCreatedTrend(filters, bucket),
    getClosedTrend(filters, bucket),
  ]);
  const createdByKey = new Map(created.map((row) => [row.bucketKey, row]));
  const closedByKey = new Map(closed.map((row) => [row.bucketKey, row]));
  return {
    headers: [
      "Period start",
      "New deals",
      "New value (AUD)",
      "Won",
      "Won value (AUD)",
      "Lost",
    ],
    rows: trendBucketKeys(bucket, filters).map((key) => [
      key,
      createdByKey.get(key)?.count ?? 0,
      dollars(createdByKey.get(key)?.totalCents ?? 0),
      closedByKey.get(key)?.wonCount ?? 0,
      dollars(closedByKey.get(key)?.wonValueCents ?? 0),
      closedByKey.get(key)?.lostCount ?? 0,
    ]),
  };
};

const forecastCsv = async (filters: ReportFilters): Promise<CsvDataset> => {
  const forecast = await getForecastByMonth(filters);
  return {
    headers: ["Month", "Deals", "Value (AUD)", "Weighted value (AUD)"],
    rows: forecast.map((row) => [
      row.monthKey ?? "No date",
      row.count,
      dollars(row.totalCents),
      dollars(row.weightedCents),
    ]),
  };
};

const dealsCsv = async (
  filters: ReportFilters,
  params: URLSearchParams
): Promise<CsvDataset> => {
  const outcomeParam = params.get("outcome");
  const deals = await getReportDeals({
    filters,
    open: params.get("open") === "1",
    outcome:
      outcomeParam === "won" || outcomeParam === "lost"
        ? outcomeParam
        : undefined,
    stageId: params.get("stage") ?? undefined,
    subStatusId: params.get("subStatus") ?? undefined,
  });
  return {
    headers: [
      "Lead ID",
      "Title",
      "Company",
      "Stage",
      "Owner",
      "Value (AUD)",
      "Created",
      "Closed",
      "Expected close",
    ],
    rows: deals.map((row) => [
      row.leadId,
      row.title,
      row.companyName,
      row.stageName,
      row.ownerName,
      dollars(row.valueCents),
      dateKey(row.createdAt),
      dateKey(row.closedAt),
      dateKey(row.expectedCloseDate),
    ]),
  };
};

const BUILDERS: Record<
  string,
  (filters: ReportFilters, params: URLSearchParams) => Promise<CsvDataset>
> = {
  deals: dealsCsv,
  forecast: forecastCsv,
  pipeline: pipelineCsv,
  trends: trendsCsv,
  winrate: winRateCsv,
};

export async function GET(request: Request): Promise<Response> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const report = params.get("report") ?? "";
  const build = BUILDERS[report];
  if (!build) {
    return NextResponse.json(
      {
        error:
          "Unknown report. Use pipeline, winrate, trends, forecast, or deals.",
      },
      { status: 400 }
    );
  }

  const filters = parseReportFilters({
    days: params.get("days") ?? undefined,
    from: params.get("from") ?? undefined,
    owner: params.get("owner") ?? undefined,
    source: params.get("source") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  const { headers, rows } = await build(filters, params);
  const csv = toCsv(headers, rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="blu-${report}-${awstDateKey(new Date())}.csv"`,
    },
  });
}
