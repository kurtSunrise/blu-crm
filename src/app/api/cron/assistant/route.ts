import { NextResponse } from "next/server";
import {
  generateDailyBriefingThreads,
  generateWeeklyReportThreads,
} from "@/lib/ai/proactive";
import { AWST_OFFSET_MS } from "@/lib/format";

// Cron-dispatched proactive assistant threads (PRD FR-8.2, Assistant v3
// Phase 2). The Worker's scheduled handler (worker-entry.mjs) posts here
// in-memory alongside the notifications sweep for the daily cron; a manual
// curl with the same bearer token also works. What runs is decided by the
// AWST weekday, not the cron expression: Monday gets the weekly report
// (INSTEAD of a briefing), Tuesday to Friday get morning briefings, and the
// weekend runs nothing. Generation is deterministic (no model calls) and
// idempotent via notification dedupe keys, so double-firing is harmless.

const MONDAY = 1;
const FRIDAY = 5;

// Perth is UTC+8 year-round; getUTCDay on the shifted instant is the AWST
// weekday (0 = Sunday).
const awstWeekday = (now: Date): number =>
  new Date(now.getTime() + AWST_OFFSET_MS).getUTCDay();

export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron is not configured (CRON_SECRET unset)" },
      { status: 503 }
    );
  }

  // A plain compare is fine here: the secret is long and random, and the
  // Cloudflare network path adds far more timing noise than the comparison.
  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const cron = new URL(request.url).searchParams.get("cron");
  const now = new Date();
  const weekday = awstWeekday(now);

  if (weekday === MONDAY) {
    const { created } = await generateWeeklyReportThreads(now);
    console.log(
      `[proactive] cron=${cron} weekday=${weekday} ran=weekly_report created=${created}`
    );
    return NextResponse.json({ created, ran: "weekly_report" });
  }

  if (weekday > MONDAY && weekday <= FRIDAY) {
    const { created, skipped } = await generateDailyBriefingThreads(now);
    console.log(
      `[proactive] cron=${cron} weekday=${weekday} ran=daily_briefing created=${created} skipped=${skipped}`
    );
    return NextResponse.json({ created, ran: "daily_briefing", skipped });
  }

  console.log(`[proactive] cron=${cron} weekday=${weekday} ran=none (weekend)`);
  return NextResponse.json({ ran: "none" });
}
