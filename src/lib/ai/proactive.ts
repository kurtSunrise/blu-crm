import { and, asc, count, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  contact,
  deal,
  followUp,
  notification,
  notificationPreference,
  user,
} from "@/db/schema";
import {
  type PersistableArtifact,
  saveMessageArtifacts,
} from "@/lib/ai/artifact-store";
import {
  appendThreadMessage,
  archiveThread,
  createThread,
} from "@/lib/ai/threads";
import {
  type DealSummary,
  dealListArtifact,
  toDealSummary,
} from "@/lib/ai/tools/query-tools";
import { toWeeklyReportArtifactData } from "@/lib/ai/tools/report-tools";
import {
  type AlertDeal,
  getAlertThresholds,
  getClosingSoonDeals,
  getDealsMissingKeyFields,
  getQuoteNudgeConfig,
  getQuotesAwaitingResponse,
  getStaleDeals,
  type QuoteAwaitingResponse,
} from "@/lib/alerts";
import { addDays, awstDateKey, type DateKey } from "@/lib/calendar";
import { countDuplicateContactGroups } from "@/lib/duplicates";
import {
  awstDayRange,
  formatAudFromCents,
  formatDateAwst,
  formatDayMonthAwst,
} from "@/lib/format";
import type { NotificationType } from "@/lib/notification-types";
import { emitNotificationBatch } from "@/lib/notifications";
import { getWeeklyReport } from "@/lib/reports";

// Proactive assistant threads (PRD FR-8.2, Assistant v3 Phase 2): the daily
// cron seeds ready-made conversations (Monday weekly report, Tue-Fri morning
// briefings) and announces each via a notification carrying the thread id.
// Strictly deterministic: templated text and reused report/alert queries,
// never a model call. Idempotency rests on the notification dedupe key
// (`{type}:{periodKey}:{userId}` once emitNotificationBatch appends the
// recipient): the up-front existing-key read skips already-done users, and
// the insert itself is the authority. If two runs race past the read, the
// loser's emit returns 0 and it archives the thread it just seeded, so a
// re-fired or overlapping cron leaves no duplicate notifications and no
// orphan threads.

const TEAM_LIMIT = 50;
const BRIEFING_LIST_LIMIT = 20;
const FOLLOW_UPS_DUE_LIMIT = 200;
const DAYS_PER_WEEK = 7;

interface TeamMember {
  id: string;
  name: string;
}

// Everyone who can sign in gets proactive threads; disabled accounts are
// skipped (they cannot open the assistant anyway).
const listActiveTeam = (): Promise<TeamMember[]> =>
  db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.disabled, false))
    .orderBy(asc(user.name))
    .limit(TEAM_LIMIT);

// The stored dedupe keys already present, so re-runs skip finished users
// BEFORE creating any thread (the notification insert's onConflictDoNothing
// alone would still leave a duplicate thread behind).
const existingDedupeKeys = async (keys: string[]): Promise<Set<string>> => {
  if (keys.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ dedupeKey: notification.dedupeKey })
    .from(notification)
    .where(inArray(notification.dedupeKey, keys));
  return new Set(rows.flatMap((row) => (row.dedupeKey ? [row.dedupeKey] : [])));
};

// Users who muted the type get no thread at all: the notification is the only
// way to discover it, and without the row the dedupe guard could not stop a
// re-run from minting duplicate threads.
const mutedUserIds = async (
  type: NotificationType,
  userIds: string[]
): Promise<Set<string>> => {
  if (userIds.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ userId: notificationPreference.userId })
    .from(notificationPreference)
    .where(
      and(
        eq(notificationPreference.type, type),
        eq(notificationPreference.enabled, false),
        inArray(notificationPreference.userId, userIds)
      )
    );
  return new Set(rows.map((row) => row.userId));
};

// AWST Monday (YYYY-MM-DD) of the week containing `now`; the weekly report's
// idempotency period. getUTCDay on the shifted key: 0 = Sunday.
export const awstWeekStartKey = (now: Date): DateKey => {
  const key = awstDateKey(now);
  const weekday = new Date(Date.parse(`${key}T00:00:00Z`)).getUTCDay();
  return addDays(key, -((weekday + 6) % DAYS_PER_WEEK));
};

interface ProactiveThreadSeed {
  artifacts: PersistableArtifact[];
  assistantText: string;
  originPage: string;
  title: string;
  userId: string;
  userPrompt: string;
}

// One synthetic exchange: a plain user turn plus a templated assistant turn
// with its artifact cards. Both turns use the plain text-block array shape
// ([{ text, type: "text" }]) that buildMessageContent persists, so replay
// (loadThreadMessages) sees a valid plain user turn and the transcript
// (loadThreadDisplayMessages) renders both sides verbatim.
const seedProactiveThread = async (
  seed: ProactiveThreadSeed
): Promise<string> => {
  const thread = await createThread(
    seed.userId,
    { originPage: seed.originPage },
    seed.title
  );
  await appendThreadMessage(thread.id, "user", [
    { text: seed.userPrompt, type: "text" },
  ]);
  const assistantMessageId = await appendThreadMessage(thread.id, "assistant", [
    { text: seed.assistantText, type: "text" },
  ]);
  await saveMessageArtifacts(thread.id, assistantMessageId, seed.artifacts);
  return thread.id;
};

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// Monday: the weekly pipeline report as a ready-made assistant thread
// ---------------------------------------------------------------------------

export const generateWeeklyReportThreads = async (
  now: Date
): Promise<{ created: number }> => {
  const weekKey = awstWeekStartKey(now);
  const team = await listActiveTeam();
  const [existing, muted] = await Promise.all([
    existingDedupeKeys(
      team.map((member) => `weekly_report:${weekKey}:${member.id}`)
    ),
    mutedUserIds(
      "weekly_report",
      team.map((member) => member.id)
    ),
  ]);

  const pending = team.filter(
    (member) =>
      !(
        existing.has(`weekly_report:${weekKey}:${member.id}`) ||
        muted.has(member.id)
      )
  );
  if (pending.length === 0) {
    return { created: 0 };
  }

  // Same numbers for everyone: compute once, reuse per user.
  const report = await getWeeklyReport(now);
  // getWeeklyReport covers the trailing seven days, so the window ENDS today;
  // "week ending" keeps the label honest against the counts below.
  const assistantText = [
    `Here is your weekly pipeline report for the week ending ${formatDateAwst(now)}.`,
    `The open pipeline holds ${plural(report.totals.openCount, "deal")} worth ${formatAudFromCents(report.totals.openTotalCents)} (${formatAudFromCents(report.totals.weightedTotalCents)} weighted).`,
    `This week: ${report.newThisWeek} new, ${report.wonThisWeek.length} won, ${report.lostThisWeek.length} lost, with ${plural(report.closingSoon.length, "deal")} closing within ${report.closingSoonDays} days and ${plural(report.needsAttention.length, "deal")} needing attention.`,
  ].join(" ");
  const artifacts: PersistableArtifact[] = [
    {
      artifactType: "weekly_report",
      data: toWeeklyReportArtifactData(report),
    },
  ];

  let created = 0;
  for (const member of pending) {
    try {
      const threadId = await seedProactiveThread({
        artifacts,
        assistantText,
        originPage: "/reports/weekly",
        title: `Weekly pipeline report - ${formatDayMonthAwst(now)}`,
        userId: member.id,
        userPrompt: "Generate this week's pipeline report",
      });
      const inserted = await emitNotificationBatch("weekly_report", [
        {
          dedupeKey: `weekly_report:${weekKey}`,
          payload: { threadId },
          recipientId: member.id,
        },
      ]);
      if (inserted === 0) {
        // The notification dedupe key is the real idempotency lock; the
        // pre-check is only a read. A concurrent or re-fired run that lost
        // the race archives its now-orphaned thread so no notification-less
        // thread lingers in the user's history.
        console.warn(
          `[proactive] weekly_report deduped for ${member.id}; archiving orphan thread ${threadId}`
        );
        await archiveThread(threadId);
        continue;
      }
      created += 1;
    } catch (error) {
      console.error(
        `[proactive] weekly_report generation failed for ${member.id}`,
        error
      );
    }
  }
  return { created };
};

// ---------------------------------------------------------------------------
// Tuesday-Friday: a per-user morning briefing thread
// ---------------------------------------------------------------------------

interface BriefingFollowUp {
  action: string;
  dealTitle: string;
  ownerId: string;
}

// Incomplete follow-ups due within the current AWST day, org-wide (same
// window as sweepFollowUpDueToday), split per owner in memory: three users,
// so one query beats three.
const followUpsDueToday = (now: Date): Promise<BriefingFollowUp[]> => {
  const { start, end } = awstDayRange(now);
  return db
    .select({
      action: followUp.action,
      dealTitle: deal.title,
      ownerId: followUp.ownerId,
    })
    .from(followUp)
    .innerJoin(deal, eq(followUp.dealId, deal.id))
    .where(
      and(
        isNull(followUp.completedAt),
        isNull(deal.deletedAt),
        gte(followUp.dueDate, start),
        lt(followUp.dueDate, end)
      )
    )
    .orderBy(asc(followUp.dueDate))
    .limit(FOLLOW_UPS_DUE_LIMIT);
};

// Live contacts not linked to any company: an org-wide hygiene signal, so it
// is a single count shared by every member's briefing.
const countContactsWithoutCompany = async (): Promise<number> => {
  const [row] = await db
    .select({ orphaned: count() })
    .from(contact)
    .where(and(isNull(contact.companyId), isNull(contact.deletedAt)));
  return row?.orphaned ?? 0;
};

// The briefing lists are the user's own deals, so the owner column is the
// recipient; contact/value/date-type are not part of the alert queries and
// stay null (the deal_list card tolerates every nullable field).
const alertDealToSummary = (row: AlertDeal, ownerName: string): DealSummary =>
  toDealSummary({
    companyName: row.companyName,
    contactName: null,
    createdAt: row.createdAt,
    expectedCloseDate: row.expectedCloseDate,
    fixedDate: row.fixedDate,
    fixedDateType: null,
    id: row.id,
    lastContactAt: row.lastContactAt,
    leadId: row.leadId,
    ownerName,
    stageName: row.stageName,
    title: row.title,
    valueCents: null,
  });

interface BriefingHygiene {
  contactsWithoutCompany: number;
  dataGapCount: number;
  duplicateContactGroups: number;
  quoteNudgeDays: number;
  quotesAwaiting: QuoteAwaitingResponse[];
}

const hygieneLines = (hygiene: BriefingHygiene): string[] => {
  const items: string[] = [];
  if (hygiene.dataGapCount > 0) {
    items.push(
      `- ${hygiene.dataGapCount} of your open deals ${hygiene.dataGapCount === 1 ? "is" : "are"} missing a fixed date, value, or confirmed decision-maker.`
    );
  }
  for (const quoteItem of hygiene.quotesAwaiting) {
    items.push(
      `- The quote on ${quoteItem.dealTitle} has waited ${hygiene.quoteNudgeDays}+ days for a response.`
    );
  }
  if (hygiene.contactsWithoutCompany > 0) {
    items.push(
      `- ${plural(hygiene.contactsWithoutCompany, "contact")} in the directory ${hygiene.contactsWithoutCompany === 1 ? "has" : "have"} no company.`
    );
  }
  if (hygiene.duplicateContactGroups > 0) {
    items.push(
      `- ${plural(hygiene.duplicateContactGroups, "possible duplicate contact")} (shared email or phone) worth merging.`
    );
  }
  if (items.length === 0) {
    return [];
  }
  return ["", "Data hygiene:", ...items];
};

const briefingText = (params: {
  closingCount: number;
  closingSoonDays: number;
  followUps: BriefingFollowUp[];
  hygiene: BriefingHygiene;
  now: Date;
  staleCount: number;
  staleDays: number;
}): string => {
  const lines = [
    `Good morning! Here is your briefing for ${formatDateAwst(params.now)}.`,
    "",
    `You have ${plural(params.followUps.length, "follow-up")} due today, ${plural(params.closingCount, "deal")} closing within ${params.closingSoonDays} days, and ${plural(params.staleCount, "deal")} quiet for ${params.staleDays}+ days.`,
  ];
  if (params.followUps.length > 0) {
    lines.push(
      "",
      "Follow-ups due today:",
      ...params.followUps.map((item) => `- ${item.action} (${item.dealTitle})`)
    );
  }
  lines.push(...hygieneLines(params.hygiene));
  return lines.join("\n");
};

export const generateDailyBriefingThreads = async (
  now: Date
): Promise<{ created: number; skipped: number }> => {
  const dayKey = awstDateKey(now);
  const team = await listActiveTeam();
  const [existing, muted, thresholds, quoteNudge] = await Promise.all([
    existingDedupeKeys(
      team.map((member) => `daily_briefing:${dayKey}:${member.id}`)
    ),
    mutedUserIds(
      "daily_briefing",
      team.map((member) => member.id)
    ),
    getAlertThresholds(),
    getQuoteNudgeConfig(),
  ]);

  const pending = team.filter(
    (member) =>
      !(
        existing.has(`daily_briefing:${dayKey}:${member.id}`) ||
        muted.has(member.id)
      )
  );
  if (pending.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // Org-wide fetches once, filtered per user in memory: the alert helpers are
  // the canonical stale/closing definitions and the team is three people.
  const [
    staleDeals,
    closingSoon,
    dueFollowUps,
    dataGapDeals,
    quotesAwaiting,
    contactsWithoutCompany,
    duplicateContactGroups,
  ] = await Promise.all([
    getStaleDeals(thresholds.staleDays),
    getClosingSoonDeals(thresholds.closingSoonDays),
    followUpsDueToday(now),
    getDealsMissingKeyFields(),
    getQuotesAwaitingResponse(quoteNudge.days),
    countContactsWithoutCompany(),
    countDuplicateContactGroups(),
  ]);

  let created = 0;
  let skipped = 0;
  for (const member of pending) {
    try {
      const myFollowUps = dueFollowUps
        .filter((item) => item.ownerId === member.id)
        .slice(0, BRIEFING_LIST_LIMIT);
      const myClosing = closingSoon
        .filter((item) => item.ownerId === member.id)
        .slice(0, BRIEFING_LIST_LIMIT);
      const myStale = staleDeals
        .filter((item) => item.ownerId === member.id)
        .slice(0, BRIEFING_LIST_LIMIT);
      const myDataGaps = dataGapDeals
        .filter((item) => item.ownerId === member.id)
        .slice(0, BRIEFING_LIST_LIMIT);
      const myQuotesAwaiting = quotesAwaiting
        .filter((item) => item.ownerId === member.id)
        .slice(0, BRIEFING_LIST_LIMIT);

      if (
        myFollowUps.length === 0 &&
        myClosing.length === 0 &&
        myStale.length === 0 &&
        myDataGaps.length === 0 &&
        myQuotesAwaiting.length === 0
      ) {
        skipped += 1;
        continue;
      }

      const artifacts: PersistableArtifact[] = [];
      if (myClosing.length > 0) {
        artifacts.push(
          dealListArtifact(
            "Closing soon",
            myClosing.map((row) => alertDealToSummary(row, member.name))
          )
        );
      }
      if (myStale.length > 0) {
        artifacts.push(
          dealListArtifact(
            "Needs attention",
            myStale.map((row) => alertDealToSummary(row, member.name))
          )
        );
      }
      if (myDataGaps.length > 0) {
        artifacts.push(
          dealListArtifact(
            "Data gaps",
            myDataGaps.map((row) => alertDealToSummary(row, member.name))
          )
        );
      }

      const threadId = await seedProactiveThread({
        artifacts,
        assistantText: briefingText({
          closingCount: myClosing.length,
          closingSoonDays: thresholds.closingSoonDays,
          followUps: myFollowUps,
          hygiene: {
            contactsWithoutCompany,
            dataGapCount: myDataGaps.length,
            duplicateContactGroups,
            quoteNudgeDays: quoteNudge.days,
            quotesAwaiting: myQuotesAwaiting,
          },
          now,
          staleCount: myStale.length,
          staleDays: thresholds.staleDays,
        }),
        originPage: "/",
        title: `Morning briefing - ${formatDayMonthAwst(now)}`,
        userId: member.id,
        userPrompt: "Give me my morning briefing",
      });
      const inserted = await emitNotificationBatch("daily_briefing", [
        {
          dedupeKey: `daily_briefing:${dayKey}`,
          payload: { threadId },
          recipientId: member.id,
        },
      ]);
      if (inserted === 0) {
        // See generateWeeklyReportThreads: archive the orphan thread the lost
        // race just created.
        console.warn(
          `[proactive] daily_briefing deduped for ${member.id}; archiving orphan thread ${threadId}`
        );
        await archiveThread(threadId);
        continue;
      }
      created += 1;
    } catch (error) {
      console.error(
        `[proactive] daily_briefing generation failed for ${member.id}`,
        error
      );
    }
  }
  return { created, skipped };
};
