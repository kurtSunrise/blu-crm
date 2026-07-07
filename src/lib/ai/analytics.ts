import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiAuditLog, chatMessage, chatThread, user } from "@/db/schema";
import { getFeedbackSummary } from "@/lib/ai/feedback";
import { addDays, awstDateKey, awstDayKeyRange } from "@/lib/calendar";
import { MS_PER_DAY } from "@/lib/format";

// Assistant usage aggregates for the admin analytics view (Assistant v3
// Phase 1). This module performs NO session check: callers MUST be
// admin-gated (the settings page gates with requireActionAdmin / the admin
// layout before calling in).

// Day buckets follow the reports convention: AWST-local calendar days
// (timestamps are stored UTC, displayed Perth time).
const AWST_TZ = "Australia/Perth";
const MESSAGES_WINDOW_DAYS = 14;
const TURNS_WINDOW_DAYS = 30;
const TOP_TOOLS_LIMIT = 20;
// ai_audit_status has six members; the LIMIT is belt and braces.
const STATUS_LIMIT = 20;
const TURNS_USER_LIMIT = 20;

export interface AssistantUsageSummary {
  feedback: { up: number; down: number };
  // User-turn messages per AWST day, last 14 days, oldest first; zero-filled
  // so the chart never has holes. ISO date keys (YYYY-MM-DD).
  messagesPerDay: { date: string; count: number }[];
  // Gated WRITE tool proposals from the audit trail, most used first. Read
  // tools (queries, knowledge search, the weekly report) run inline and are
  // never audited, so they cannot be counted here; label any UI accordingly.
  toolCalls: { toolName: string; count: number }[];
  // User-role chat messages per team member, last 30 days.
  turnsPerUser: { userName: string; count: number }[];
  // ai_audit_log status counts (proposed/confirmed/denied/executed/failed/
  // skipped).
  writeOutcomes: { status: string; count: number }[];
}

// The same expression must appear in SELECT and GROUP BY, so the timezone is
// inlined (sql.raw), not a bound parameter: with parameters each occurrence
// gets a different placeholder number and Postgres treats them as different
// expressions (same reasoning as trendBucketKey in reports.ts). The value is
// an internal constant, never user input.
const messageDayKey = sql<string>`to_char(${chatMessage.createdAt} at time zone ${sql.raw(`'${AWST_TZ}'`)}, 'YYYY-MM-DD')`;

export const getAssistantUsageSummary =
  async (): Promise<AssistantUsageSummary> => {
    const now = new Date();
    // Window opens at the AWST start of the oldest charted day, so the first
    // bucket is a full day, not a partial one.
    const oldestDayKey = addDays(awstDateKey(now), -(MESSAGES_WINDOW_DAYS - 1));
    const messagesSince = awstDayKeyRange(oldestDayKey).start;
    const turnsSince = new Date(now.getTime() - TURNS_WINDOW_DAYS * MS_PER_DAY);

    // Independent aggregates fan out together; sequential Neon awaits in one
    // render are what caused the deal-page 503s on workerd.
    const [dayRows, userRows, toolRows, statusRows, feedback] =
      await Promise.all([
        db
          .select({ count: count(), date: messageDayKey })
          .from(chatMessage)
          .where(
            and(
              eq(chatMessage.role, "user"),
              gte(chatMessage.createdAt, messagesSince)
            )
          )
          .groupBy(messageDayKey)
          .limit(MESSAGES_WINDOW_DAYS),
        db
          .select({ count: count(), userName: user.name })
          .from(chatMessage)
          .innerJoin(chatThread, eq(chatMessage.threadId, chatThread.id))
          .innerJoin(user, eq(chatThread.userId, user.id))
          .where(
            and(
              eq(chatMessage.role, "user"),
              gte(chatMessage.createdAt, turnsSince)
            )
          )
          .groupBy(user.name)
          .orderBy(desc(count()))
          .limit(TURNS_USER_LIMIT),
        db
          .select({ count: count(), toolName: aiAuditLog.toolName })
          .from(aiAuditLog)
          .groupBy(aiAuditLog.toolName)
          .orderBy(desc(count()))
          .limit(TOP_TOOLS_LIMIT),
        db
          .select({ count: count(), status: aiAuditLog.status })
          .from(aiAuditLog)
          .groupBy(aiAuditLog.status)
          .orderBy(desc(count()))
          .limit(STATUS_LIMIT),
        getFeedbackSummary(),
      ]);

    // Zero-fill the 14-day series, oldest first.
    const countsByDay = new Map(dayRows.map((row) => [row.date, row.count]));
    const messagesPerDay: { date: string; count: number }[] = [];
    for (let offset = MESSAGES_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
      const date = addDays(awstDateKey(now), -offset);
      messagesPerDay.push({ count: countsByDay.get(date) ?? 0, date });
    }

    return {
      feedback,
      messagesPerDay,
      toolCalls: toolRows,
      turnsPerUser: userRows,
      writeOutcomes: statusRows,
    };
  };

export { MESSAGES_WINDOW_DAYS, TURNS_WINDOW_DAYS };
