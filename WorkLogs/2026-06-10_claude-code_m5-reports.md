# Work Log: M5 Reports — Dashboard & Weekly Pipeline Report (FR-8)

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: N/A
**Mode**: Implementation
**Date**: 2026-06-10T00:00:00+08:00

## Task Description

First slice of M5: FR-8.1 reporting dashboard (pipeline overview, weighted
forecast, win rate with lost-reason breakdown, activity volume per person,
admin-editable stage weightings) and FR-8.2 Weekly Pipeline Report in Blu's
seven-section Monday format. The AI-artifact rendition of the weekly report
stays with M4; this delivers the deterministic report with a copy-and-share
plain-text rendition.

## Actions Taken

- Added `deal.closed_at` (set when a deal enters a Won or Lost / Dormant
  stage in `moveDealStage`, cleared if the deal is reopened) and pushed the
  schema to the local-config Neon database with `npm run db:push`.
- Created `src/lib/reports.ts`: `getStageBreakdown`, `summarisePipeline`,
  `getWinRate`, `getActivityVolume`, `getWeeklyReport`, and
  `renderWeeklyReportText`. The dashboard and the weekly report consume the
  same helpers so their numbers reconcile exactly (FR-8.2 AC). Deal value is
  `coalesce(quoted, estimated, 0)` everywhere, matching the home dashboard.
- New `/reports` page: open pipeline totals, weighted forecast, per-stage
  value bars, win rate with lost-reason breakdown, and activity volume, with
  a 7/30/90-day period selector via search params (server-rendered links,
  no client state).
- New `/reports/weekly` page: the seven sections (summary, closing soon,
  needs attention, full pipeline by stage, won this week, lost/dormant this
  week, actions for the week) plus a Copy report button
  (`copy-report-button.tsx`) that copies the plain-text rendition.
- Stage weightings are now editable in `/settings`
  (`stage-weightings-form.tsx`, `updateStageWeightings` action,
  `stageWeightingSchema` validation, 0–100 whole percentages).
- Nav: Reports added to the desktop sidebar; deliberately kept out of the
  phone bottom tabs (five field destinations stay), reachable from the
  dashboard module card, which is now Live.
- Added `e2e/reports.spec.ts` (4 tests: dashboard sections, Won deal appears
  in the weekly report with its value, open deals listed by stage, weighting
  edit surfaces on the forecast).

## Decisions Made

- **`closed_at` over parsing activity text**: stage changes were only
  recorded as free-text activity rows; a timestamp column is the reliable
  basis for "won/lost this week" and win-rate periods. Deals closed before
  this change have `closed_at` NULL and won't appear in period-bound
  win-rate or weekly won/lost lists (no backfill — `updatedAt` would lie).
- **Weekly window = trailing 7 days** ending at generation time, so a
  Monday-morning run reads as last week and the numbers stay reconcilable
  with `/reports?days=7`.
- **Actions for the week** = incomplete follow-ups due before now + 7 days
  (includes overdue), ordered by due date.
- **Activity attribution**: `activity.created_by` is not yet populated
  (auth gating pending), so activity volume groups under "Unattributed"
  until then; the query already joins `user` and will split per person once
  attribution lands.

## Issues Encountered

- `EMAIL_INTAKE_TOKEN` was missing from `.env.local`, so both email-intake
  E2E tests failed with 503 (route returns 503 when unset). Added the value
  the spec expects (`local-dev-intake-token`) and restarted the dev server.
- Full-suite E2E runs are flaky in this environment: `.env.local` points at
  a **remote Neon** database (ap-southeast-2), so ~93 fully-parallel tests
  go over Neon's HTTP driver and intermittently fail with `fetch failed`
  (a different scatter of tests each run). This also means the
  global-setup data wipe is skipped (it only wipes localhost databases).
  Reports/won-lost specs pass cleanly when run as a group. Consider a local
  Postgres for E2E runs or capping workers.

## Next Steps

- Backfill or accept NULL `closed_at` for historically closed deals.
- `npm run db:push:prod` is required before deploying (new `closed_at`
  column) — left to the user.
- M4 AI assistant: generate/edit the weekly report as an artifact
  (PRD FR-8.2), reusing `getWeeklyReport` as the tool's data source.
- Per-person activity volume becomes meaningful once `created_by` is set on
  activities (needs auth/session wiring).

## Related Files

- `src/db/schema.ts` — `deal.closedAt`
- `src/lib/actions/deal-actions.ts` — set/clear `closedAt` on stage moves
- `src/lib/reports.ts` — shared report queries + plain-text rendition
- `src/app/(app)/reports/page.tsx` — FR-8.1 dashboard
- `src/app/(app)/reports/weekly/page.tsx` — FR-8.2 weekly report
- `src/components/copy-report-button.tsx`
- `src/components/stage-weightings-form.tsx`
- `src/lib/actions/settings-actions.ts` — `updateStageWeightings`
- `src/lib/validation/settings.ts` — `stageWeightingSchema`
- `src/app/(app)/settings/page.tsx` — weightings section
- `src/components/app-shell.tsx`, `src/app/(app)/page.tsx` — navigation
- `e2e/reports.spec.ts`
