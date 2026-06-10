# Work Log: Reports (FR-8) + Best-in-Class Dashboard

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: cse_01WsDKrW9UJW7aBbMFBca1nW
**Mode**: Implementation (autonomous)
**Date**: 2026-06-11T10:30:00+08:00
**Duration**: ~2 hours across two requests

## Task Description

User reprioritised: Reports before auth ("reports is not yet complete"),
then asked for a best-in-class dashboard. Auth work in progress was parked
unmerged on `claude/auth-parked` (see that branch's WIP commit for state
and remaining steps).

## Actions Taken

- **Reporting library** (`src/lib/reporting.ts`): shared reads used by the
  dashboard, /reports, and the weekly report so numbers reconcile by
  construction (FR-8.2 AC): pipeline by stage with weighted forecast
  (value x stage weighting, FR-8.1), win rate with lost-reason breakdown,
  activity volume by type/person, new-lead counts, actions for the week,
  and `awstWeekRange` (Monday-to-Monday, Perth).
- **/reports** (FR-8.1): open pipeline, weighted forecast, and win-rate
  KPI cards; per-stage value list with weightings; lost/dormant reason
  breakdown; activity volume by type and person (pre-auth history shows as
  Unattributed).
- **/reports/weekly** (FR-8.2): the seven-section Monday snapshot in Blu's
  exact format (Summary, Closing soon, Needs attention, Full pipeline by
  stage, Won this week with handover status, Lost/dormant with reasons,
  Actions for the week), rendered live. The one-tap AI artifact version
  arrives with M4/M5.
- **Dashboard** (`/`): replaced the static module grid with a working
  dashboard: date header + primary Quick add action; Inbox triage callout
  when unassigned leads exist; four KPI tiles (open pipeline, weighted
  forecast, win rate, overdue follow-ups in red); pipeline-by-stage CSS
  bar chart; Today's tasks with one-tap complete (overdue first, FR-5.2);
  Closing soon and Needs attention top-5 lists; recent-activity feed;
  footer links (Reports/Help/Settings) keep mobile reachability.
- Reports added to the sidebar nav (desktop; mobile reaches it via the
  dashboard KPI links and footer). Smoke spec rewritten for the dashboard.
- **E2E**: `e2e/reports.spec.ts` covers the dashboard structure and the
  weekly report (won deal with value + handover badge, lost deal with
  reason, reason feeding the /reports breakdown). 87/87 passing twice
  consecutively on phone/tablet/desktop; lint, tsc, build clean.

## Decisions Made

- **Close-time approximation**: "won/lost this week" uses the deal's
  `updated_at` while in a Won/Lost stage; deals rarely change after
  closing. A `stage_changed_at` column can land later if precision
  matters.
- **No chart dependency**: the stage breakdown is CSS bars; recharts can
  come with M5 polish if wanted.
- **Win-rate window** is fixed at 30 days for now; period selection is an
  easy follow-up.
- Module-grid home page retired; navigation lives in the shell and the
  dashboard footer.

## Issues Encountered

- A persistent tablet-only flake in the new weekly-report spec: Next's
  router refresh after a stage move intermittently interrupted the next
  `page.goto` ("navigation interrupted by another navigation"). POST-wait
  plus `networkidle` was not sufficient; fixed by running the report
  assertions in a fresh page in the same context, which pending refreshes
  on the board page cannot interrupt.

## Next Steps

- Resume auth from `claude/auth-parked` (remaining: Playwright
  storageState sign-in in global setup, sign-in/out E2E, docs), when the
  user gives the word.
- R2 bucket + `db:push:prod` + deploy (production still runs M1-era code).
- M4 AI assistant, including the one-tap AI-generated weekly report
  artifact.
- Reports polish: period selector, admin-editable stage weightings
  (FR-8.1), `stage_changed_at` for exact close dates.

## Related Files

- src/lib/reporting.ts, src/app/(app)/reports/{page.tsx,weekly/page.tsx}
- src/app/(app)/page.tsx (dashboard), src/components/app-shell.tsx
- e2e/{reports,smoke}.spec.ts
