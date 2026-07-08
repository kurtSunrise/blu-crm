import { z } from "zod";
import type {
  ArtifactPayload,
  WeeklyReportAlertDeal,
  WeeklyReportArtifactData,
} from "@/lib/ai/stream-protocol";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";
import type { AlertDeal } from "@/lib/alerts";
import { formatAudFromCents, toIsoOrNull } from "@/lib/format";
import {
  getWeeklyReport,
  type ReportActionRow,
  type WeeklyReport,
} from "@/lib/reports";

// The Monday weekly pipeline report as an assistant artifact (Assistant v3).
// The full report renders client-side as a weekly_report card; the model only
// sees a compact stat summary so the turn stays token-lean.

const toAlertDealData = (row: AlertDeal): WeeklyReportAlertDeal => ({
  companyName: row.companyName,
  createdAt: row.createdAt.toISOString(),
  expectedCloseDate: toIsoOrNull(row.expectedCloseDate),
  fixedDate: toIsoOrNull(row.fixedDate),
  id: row.id,
  lastContactAt: toIsoOrNull(row.lastContactAt),
  leadId: row.leadId,
  ownerId: row.ownerId,
  stageName: row.stageName,
  title: row.title,
});

const toActionRowData = (row: ReportActionRow) => ({
  action: row.action,
  dealId: row.dealId,
  dealTitle: row.dealTitle,
  dueDate: row.dueDate.toISOString(),
  id: row.id,
  ownerName: row.ownerName,
});

// Exported for the proactive generators (src/lib/ai/proactive.ts), which
// build the same weekly_report artifact without a model turn.
export const toWeeklyReportArtifactData = (
  report: WeeklyReport
): WeeklyReportArtifactData => ({
  actions: report.actions.map(toActionRowData),
  closingSoon: report.closingSoon.map(toAlertDealData),
  closingSoonDays: report.closingSoonDays,
  generatedAt: report.generatedAt.toISOString(),
  lostThisWeek: report.lostThisWeek,
  needsAttention: report.needsAttention.map(toAlertDealData),
  newThisWeek: report.newThisWeek,
  openByStage: report.openByStage,
  staleDays: report.staleDays,
  totals: report.totals,
  weekStart: report.weekStart.toISOString(),
  wonThisWeek: report.wonThisWeek,
});

const sumValueCents = (rows: { valueCents: number }[]): number =>
  rows.reduce((sum, row) => sum + row.valueCents, 0);

// Compact stat lines for the model: counts and totals only, never the full
// report JSON (the user already sees the card).
const summarizeReport = (report: WeeklyReport): string => {
  const lines = [
    "Weekly report generated and shown to the user as a card. Key numbers:",
    `- Open pipeline: ${report.totals.openCount} deals, ${formatAudFromCents(report.totals.openTotalCents)} total, ${formatAudFromCents(report.totals.weightedTotalCents)} weighted`,
    `- New this week: ${report.newThisWeek}`,
    `- Won this week: ${report.wonThisWeek.length} (${formatAudFromCents(sumValueCents(report.wonThisWeek))})`,
    `- Lost this week: ${report.lostThisWeek.length} (${formatAudFromCents(sumValueCents(report.lostThisWeek))})`,
    `- Closing within ${report.closingSoonDays} days: ${report.closingSoon.length}`,
    `- Needs attention (quiet ${report.staleDays}+ days): ${report.needsAttention.length}`,
    `- Actions due: ${report.actions.length}`,
    "Summarise the highlights briefly; do not repeat the whole report.",
  ];
  return lines.join("\n");
};

const getWeeklyReportTool = defineTool({
  description:
    "Fetch the Monday weekly pipeline report: summary totals, deals closing soon, deals needing attention, the full open pipeline by stage, won and lost this week, and the follow-up actions due. Call this when the user asks for the weekly report, a pipeline snapshot, or a Monday summary. Shows the full report to the user as a card.",
  execute: async () => {
    const report = await getWeeklyReport();
    const artifact: ArtifactPayload = {
      artifactType: "weekly_report",
      data: toWeeklyReportArtifactData(report),
      type: "artifact",
    };
    return {
      artifacts: [artifact],
      resultText: summarizeReport(report),
    };
  },
  isWrite: false,
  name: "get_weekly_report",
  schema: z.object({}),
});

export const reportTools: AiTool[] = [getWeeklyReportTool];
