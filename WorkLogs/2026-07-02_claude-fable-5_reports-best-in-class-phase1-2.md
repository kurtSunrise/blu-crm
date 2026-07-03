# Work Log: Reports Best-in-Class Upgrade, Phases 1-2 (Stage Events, Filters, Trends, CSV)

**Agent**: claude-fable-5
**Session ID**: 3d42909c-16c2-4fb3-85d2-2292b011df93
**Mode**: Implementation (plan mode design, then direct implementation)
**Date**: 2026-07-02T15:30:00+08:00 (approximate)

## Task Description
Upgrade `/reports` toward best in class, delivering Phases 1 and 2 of the approved plan at `~/.claude/plans/what-is-needed-to-expressive-kay.md`. Phase 1 builds a durable stage-event history foundation (`deal_stage_event` table, write hooks, backfill). Phase 2 adds report filters, drill-down, trend/forecast charts, and CSV export.

Verification: ultracite clean on changed files, `npm run build` passes, `e2e/reports-analytics.spec.ts` 7/7 pass on desktop, and live create/move stage events confirmed in the dev DB.

## Actions Taken

### Phase 1, stage-event foundation
- Added `deal_stage_event` table to `src/db/schema.ts` plus a new `stage_event_source` pgEnum (`create`/`move`/`stage_delete`/`backfill`). Soft stage references (NO FK to `pipeline_stage`, because `deleteStage` hard-deletes stages), from/to stage NAME snapshots, unique nullable `activityId` FK (backfill idempotency key), indexes on `(dealId, changedAt)`, `changedAt`, and `toStageId`. Pushed to dev with `db:push`.
- Added write hooks at all three `deal.stageId` write sites (verified exhaustive by grep):
  1. `moveDealStage` (`src/lib/actions/deal-actions.ts`): pre-selects current stage + name, true no-op re-submits return early (same stage AND same lostReason/handover), activity insert now uses `.returning` for the id, event inserted only on genuine stage change (source `move`). Also extracted `stageMoveActivityContent` and `notifyHandoverToDelivery` helpers to satisfy the complexity lint.
  2. `createLead`/`insertDealWithLeadId` (`src/lib/intake.ts`): insert returns `{id, createdAt}`; creation event stamped with the deal's exact `createdAt` (source `create`); placement stage name resolved up front (explicit stageId from CSV import is validated and now throws on unknown stage).
  3. `deleteStage` (`src/lib/actions/stage-actions.ts`): one `INSERT..SELECT` via `db.execute` writes a `stage_delete` event per affected deal before the bulk reassignment.
- Wrote backfill script `scripts/backfill-stage-events.ts` (pg client, transactional, idempotent via `ON CONFLICT (activity_id) DO NOTHING` plus a `NOT EXISTS` guard for synthetic create events; all rows source `backfill`; parses "Moved to X (reason: ...)" free-text `stage_change` activities; post-commit verification pass reports last-event-vs-current-stage mismatches and unresolved stage names). Added `package.json` scripts `db:backfill-stage-events` and `db:backfill-stage-events:prod`.
- Dev backfill run: 56 events inserted, re-run inserted 0 (idempotent), verification clean, one unresolved legacy stage name "Proposal Review" kept as snapshot.

### Phase 2, filters, drill-down, trends, CSV
- `src/lib/reports.ts`: exported `dealValueCents` (reconciliation invariant documented in the header comment); added `ReportFilters` + `parseReportFilters` (`?days` pills or `?from`/`?to` AWST custom range, `?owner`, `?source` validated against the leadSource enum), `reportFilterParams`, `describeReportPeriod`; threaded `dealFilterConditions` through `getStageBreakdown`/`getWinRate`/`getActivityVolume`/`getSubStatusBreakdown` as OPTIONAL args (dashboard call sites unchanged, so reconciliation preserved by construction); added `getReportOwners`, `getStageName`, `getReportDeals` (drill-down, limit 200); trend queries `getCreatedTrend`/`getClosedTrend` (AWST week/month buckets via `date_trunc at time zone 'Australia/Perth'`), `getForecastByMonth` (weighted by stage weighting, null expected-close bucketed as "No date"), `getSlippedDeals` (open deals past `expectedCloseDate`), `trendBucketFor`/`trendBucketKeys` (JS gap filling).
- `src/lib/report-filters.ts` (new): client-safe module holding `REPORT_PERIOD_OPTIONS`/`DEFAULT_REPORT_PERIOD_DAYS`/`ReportOwnerOption`, split out because the client filter bar importing them from `reports.ts` dragged the db client into the browser bundle and broke the webpack build.
- UI: `src/components/reports/reports-nav.tsx` (Overview/Trends/Weekly/Daily pills carrying the filter query), `report-filters.tsx` (client; period pills + native date range + owner/source NativeSelects; state lives in the URL via `router.replace`), `export-csv-link.tsx`. Overview page (`reports/page.tsx`) now has clickable StatCards, stage bars, and sub-status rows drilling to `/reports/deals`. New `/reports/deals` drill-down page (+loading) with scope heading and per-row links to `/deals/[id]`. New `/reports/trends` page (+loading) with `TrendChart` (new pipeline vs won value, line, 2 series) and `ForecastChart` (weighted value by expected close month, bar) plus a slipped-deals list and a "View as table" fallback. `ReportsNav` added to the weekly and daily pages.
- Charts: shadcn chart component added (`npx shadcn add chart`, recharts ^3.8.0, client-only chunks so zero Worker bundle cost); `src/components/ui/chart.tsx` refactored to house lint style (named imports, module-level `TooltipRow`/`TooltipIndicator`, stable keys, one biome-ignore for the CSS-var style injection). Followed the dataviz skill: chart colors validated with its palette validator; `globals.css` `--chart-2` darkened (#00ab60 -> #00975a light, #2bbb71 -> #21a865 dark) so both series pass 3:1 contrast and the dark lightness band with `--chart-1`; charts have `role="img"` + `aria-label` and a table fallback.
- CSV export: `toCsv` writer added to the existing `src/lib/csv.ts` (RFC 4180 + formula-injection guard, numbers exempt); `GET /api/reports/export?report=pipeline|winrate|trends|forecast|deals` reusing the exact `reports.ts` query functions, `getSessionUserId` auth (401 JSON when signed out), `Content-Disposition` attachment `blu-<report>-<date>.csv`; export buttons on overview/trends/drill-down carrying the current filters.
- `src/lib/format.ts`: added `formatAudCompactFromCents` for axis ticks.
- E2E: new `e2e/reports-analytics.spec.ts` (7 tests: dashboard/reports open-pipeline reconciliation guard, drill-down click-through, owner filter excludes unowned deal, custom date range scopes won drill-down, trends charts render with table fallback, CSV 200 with data, CSV 401 signed out). `e2e/test-data-sweep.ts` gained a `deal_stage_event` step (before activity; the new FKs blocked the sweep).

## Decisions Made
- **Soft stage references, name snapshots**: `deal_stage_event` deliberately has NO FK to `pipeline_stage` and snapshots from/to stage names, because `deleteStage` hard-deletes stages and history must survive that.
- **Unique nullable `activityId`** as the backfill idempotency key: `ON CONFLICT DO NOTHING` makes backfill and live writes race-proof.
- **Creation events stamped with the deal's exact `createdAt`** (not insert time) so trend buckets match reality.
- **Filters as OPTIONAL query args**: `dealFilterConditions` threaded into existing report functions without changing dashboard call sites, so the dashboard-vs-reports reconciliation invariant is preserved by construction.
- **`report-filters.ts` client-safe split**: constants moved out of `reports.ts` because importing them into a client component pulled the db client into the browser bundle.
- **Prod rollout order (differs from the sub-status runbook, do not cargo-cult)**: 1) `npm run db:push:prod` (additive DDL is safe under old code), 2) `npm run deploy`, 3) `npm run db:backfill-stage-events:prod`. `activity_id` uniqueness makes the backfill safe against concurrent live writes. NOT YET RUN AGAINST PROD.
- **Sparklines on overview StatCards consciously skipped**: no historical snapshot data exists for open pipeline, and it avoids a 6th query on the overview.
- **Charts client-only via shadcn/recharts** so the Worker bundle pays zero cost; darkened `--chart-2` for 3:1 contrast per the dataviz skill's palette validator.

## Issues Encountered
- Webpack build failure: a client component importing constants from `reports.ts` pulled `node:module`/`node:net` via `@/db`. Fixed with the `report-filters.ts` split.
- `/reports/trends` 500: the `date_trunc` bucket and timezone were bound parameters, so the GROUP BY expression got different placeholder numbers than the SELECT and Postgres rejected it. Fixed by inlining the two internal constants with `sql.raw` (documented in a code comment).
- E2E global-setup sweep broke on the new FKs (`deal_stage_event` -> `deal` and -> `activity`); fixed with a sweep step ahead of activity.
- shadcn CLI reformatted `src/components/ui/card.tsx` (style churn only); reverted via `git checkout`.
- Full-repo ultracite remains blocked by the pre-existing stray `.kilo` worktree; checks were scoped to changed files (same as the 2026-07-02 deal-value-range log).

## Addendum (2026-07-03)

- Prod rollout completed on 2026-07-02: `db:push:prod`, `npm run deploy`, then `db:backfill-stage-events:prod` (71 events, verification clean).
- Help page (`src/app/(app)/help/page.tsx`) updated to document the new reporting: the four report views and their nav pills, filters (period / custom range / owner / source), tap-to-drill-down, the Trends report (new-vs-won chart, forecast by close month, slipped deals), and CSV export. Added matching "What's new" entries under 02/07/2026 and a "Slipped deal" glossary term. Verified with e2e/help-and-theme.spec.ts and deployed.
- Fixed in passing: a Base UI `nativeButton` warning from the assistant dock's settings button (`src/components/ai/chat-launcher.tsx` renders a Link, now `nativeButton={false}`). The warning surfaced the Next dev issues badge, which also blocked the theme-toggle e2e test.

## Next Steps
- Prod rollout in the order above (push, deploy, backfill): DONE, see addendum.
- Phase 3 (funnel + stage velocity from `deal_stage_event`) and Phase 4 (quote analytics incl. a `quote.respondedAt` column, team leaderboard) are designed in the plan file as fast follows; confirm scope with Kurt first (the scope question got no answer, recommended defaults were assumed).
- `reports-analytics` spec was run on desktop (7/7); the phone project run was in flight at log time. Consider adding `/reports/trends` and `/reports/deals` to the `e2e/accessibility.spec.ts` scans.

## Related Files
- `src/db/schema.ts`
- `src/lib/actions/deal-actions.ts`
- `src/lib/actions/stage-actions.ts`
- `src/lib/intake.ts`
- `scripts/backfill-stage-events.ts` (new)
- `package.json`
- `src/lib/reports.ts`
- `src/lib/report-filters.ts` (new)
- `src/lib/csv.ts`
- `src/lib/format.ts`
- `src/app/globals.css`
- `src/components/reports/reports-nav.tsx` (new)
- `src/components/reports/report-filters.tsx` (new)
- `src/components/reports/export-csv-link.tsx` (new)
- `src/components/reports/charts/trend-chart.tsx` (new)
- `src/components/reports/charts/forecast-chart.tsx` (new)
- `src/components/ui/chart.tsx` (new)
- `src/app/(app)/reports/page.tsx`
- `src/app/(app)/reports/deals/page.tsx` (new, plus `loading.tsx`)
- `src/app/(app)/reports/trends/page.tsx` (new, plus `loading.tsx`)
- `src/app/(app)/reports/weekly/page.tsx`
- `src/app/(app)/reports/daily/page.tsx`
- `e2e/reports-analytics.spec.ts` (new)
- `e2e/test-data-sweep.ts`
- Related prior logs: `WorkLogs/2026-06-10_claude-code_m5-reports.md`, `WorkLogs/2026-07-02_claude-sonnet-5_deal-value-range-and-contact-lookup.md`
