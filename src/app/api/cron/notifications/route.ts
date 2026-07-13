import { NextResponse } from "next/server";
import {
  sweepFollowUpDueToday,
  sweepOverdueFollowUpNotifications,
  sweepQuoteNoResponseNudges,
  sweepStaleDealNudges,
} from "@/lib/notification-sweeps";

// Cron-dispatched notification sweeps (FR-11.1). The Worker's scheduled
// handler (worker-entry.mjs) posts here in-memory with the cron expression as
// a query param; a manual curl with the same bearer token also works. Every
// sweep is idempotent via dedupe keys, so overlap or double-firing is
// harmless.

const FREQUENT_CRON = "*/20 * * * *";
const DAILY_CRON = "0 23 * * *";

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
  const inserted: Record<string, number> = {};

  if (cron === FREQUENT_CRON || cron === null) {
    inserted.followUpOverdue = await sweepOverdueFollowUpNotifications();
  }
  if (cron === DAILY_CRON || cron === null) {
    inserted.followUpDue = await sweepFollowUpDueToday();
    inserted.staleDeal = await sweepStaleDealNudges();
    inserted.quoteNoResponse = await sweepQuoteNoResponseNudges();
  }

  return NextResponse.json({ inserted });
}
