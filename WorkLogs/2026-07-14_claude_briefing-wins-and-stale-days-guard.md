# Work Log: Morning briefing recent-wins line + stale-days guard

**Agent**: Claude (Opus 4.8, Claude Code)
**Session ID**: N/A
**Mode**: Feature + bugfix (server-side proactive assistant)
**Date**: 2026-07-14T08:28:00Z
**Duration**: ~1 session

## Task Description

Kurt reported his 14/07/2026 morning briefing said "7 deals quiet for 0+ days"
and worried the system had missed that "AGWA - Stormie Mills Room of Secrets"
was won. Investigation on the live site showed the deal (BLU-2026-939, owner
Kurt) is correctly in the Won stage (closed 13/07/2026) and is NOT in the quiet
list. Two real issues surfaced instead:

1. The briefing only reports open work and never acknowledges wins, so a
   freshly-won deal silently drops out with no mention.
2. "quiet for 0+ days" is a genuine misconfiguration: the `stale_days` setting
   is stored as `0`, which makes the stale query flag every open deal.

Both approved by Kurt.

## Actions Taken

- `src/lib/alerts.ts`:
  - `getAlertThresholds` now guards `staleDays`: a stored value below 1 falls
    back to `DEFAULT_STALE_DAYS` (7). Confirmed via dev DB that `stale_days` is
    literally `'0'`.
  - Added `getRecentlyWonDeals(since)` + `RecentlyWonDeal`. Sourced from
    `deal_stage_event`; a row qualifies when its target stage `isWon` AND is the
    deal's current stage (`toStageId = deal.stageId`), so a won-then-reopened
    deal is excluded. Deduped to most-recent event per deal. LIMIT 200.
- `src/lib/validation/settings.ts`: `staleDays` min raised `0 -> 1`.
- `src/components/alert-thresholds-form.tsx`: stale-days input `min={1}`.
- `src/lib/ai/proactive.ts`: briefing now fetches recent wins (window = start of
  previous AWST day), filters per owner, adds a "Won recently" deal_list card
  and a "Nice work - you won N deal(s)..." line, and includes wins in the
  all-empty skip guard so a wins-only briefing still sends.

## Decisions Made

- Win window = start of the previous AWST day: a deal won yesterday appears in
  today's briefing exactly once. Weekend wins (Fri->Tue gap) are covered by
  Monday's weekly report (`closedThisWeek`), so no wider lookback needed.
- Kept the read-time guard in addition to the validation min so the already-
  stored `0` is corrected without a prod DB write (per the no-prod-write rule).
- `isWon` is only set by the seed and is not editable in the stage manager, so a
  mis-set flag was ruled out; the real cause was the `stale_days=0` setting.

## Issues Encountered

- tsx does not resolve `@/` path aliases the way the app does, so the ad-hoc
  verification used a raw `pg` query mirroring the Drizzle query rather than
  importing the helper. Confirmed the query runs and returns a still-won deal.

## Verification

- `npm exec -- ultracite fix` (clean), `npm run build` (passes).
- Raw-SQL check against the dev DB: recent-wins query returns 1 still-won deal;
  `stale_days` confirmed `'0'`, `closing_soon_days` `'14'`.
- Not yet deployed. No schema change (deal_stage_event already live). No prod DB
  migration required; the stored `stale_days=0` is handled by the read guard.

## Next Steps

- Deploy via local `npm run deploy` (only path to prod), then verify a
  cache-busted load and, ideally, the next briefing content.
- Optional: Kurt may set an explicit `stale_days` in Settings (now min 1); until
  then it behaves as the default 7.

## Related Files

- src/lib/alerts.ts
- src/lib/ai/proactive.ts
- src/lib/validation/settings.ts
- src/components/alert-thresholds-form.tsx
