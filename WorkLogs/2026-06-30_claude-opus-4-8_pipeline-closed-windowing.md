# Work Log: Pipeline Won / Lost windowing and Closed deals view

**Agent**: claude-opus-4-8
**Session ID**: N/A
**Mode**: Plan then implement (feature work)
**Date**: 2026-06-29T23:40:43Z
**Duration**: ~1 hour

## Task Description

The pipeline kanban board loaded every non-deleted deal, so the Won and Lost /
Dormant columns grew without bound over time. This both bloated the page payload
and buried the active pipeline behind ever-growing closed columns. The goal was
to keep only recently closed deals on the board, present the closed columns as
collapsible summaries, and move the full closed-deal history to a dedicated,
filterable view. No deletion or mutation of production data.

## Actions Taken

- Extracted `getQuotesByDeal` and `computeDealValue` (plus the `DealValue` type)
  from `pipeline/page.tsx` into a shared `src/lib/deal-values.ts` so the board
  and the new Closed view share one value derivation.
- Windowed the board query in `pipeline/page.tsx`: active deals always load;
  deals in closed stages (`isWon` / `isLost`) load only when
  `coalesce(closedAt, updatedAt)` falls within `CLOSED_WINDOW_DAYS` (60). Added
  a "Closed deals" link beside the Pipeline heading.
- Made the Won and Lost / Dormant columns collapsible in `pipeline-board.tsx`.
  They render collapsed by default as a narrow summary (count, total, "last N
  days", and a "View all" link to the closed view) and expand on tap. The
  collapsed column keeps its droppable ref, so a card can still be dragged onto
  it, preserving the `StageChangeDialog` handover / lost-reason flow.
- Added the dedicated Closed deals view: `pipeline/closed/page.tsx` (server,
  queries closed-stage deals newest first) and `closed-deals-list.tsx` (client
  filters: outcome, owner, close-date preset defaulting to last 90 days, and
  text search). The board's per-column "View all" link pre-selects the matching
  outcome via `?stage=won|lost`.
- Updated and extended Playwright coverage; ran the affected specs on the
  desktop and phone projects (all green), plus `npm run build` and scoped
  `ultracite` checks.

## Decisions Made

- Window on closed stage membership with `coalesce(closedAt, updatedAt)` rather
  than `closedAt` alone, so any seed or legacy row closed before `closedAt` was
  stamped is still dated and bounded correctly. `closedAt` is reliably set on
  Won / Lost moves (`deal-actions.ts`), so this is belt-and-braces.
- Kept `CLOSED_WINDOW_DAYS` a constant (60) for now. Promoting it to an admin
  `appSetting` is noted as a future improvement; no schema change was needed.
- The Closed view loads all closed deals and filters client-side, mirroring the
  board's existing sub-status chip pattern. This view is opt-in (not the default
  board), so the load is acceptable; server-side pagination is a future option.
- Rewrote the brittle "shows all eight default stages" test. Stages are
  admin-configurable and the e2e DB is a prod clone that does not carry
  "Proposal Review", so the hardcoded eight-stage list failed there regardless
  of this change. The test now asserts the stable anchors (Lead Captured plus
  the un-removable Won and Lost / Dormant) by their section, which also covers
  the new collapsed-summary structure.

## Issues Encountered

- TypeScript: `or(...)` is typed `SQL | undefined`; typed the filter array as
  `SQL[]` and pushed the condition behind a truthiness guard.
- Lint: the closed-list filter callback exceeded the cognitive-complexity limit;
  split it into top-level `matchesOutcome` / `matchesOwner` / `matchesCutoff` /
  `matchesQuery` predicates. Also hoisted inline regex literals in the specs to
  module scope (`useTopLevelRegex`).
- The eight-stages test failed against the remote staging DB because that DB has
  no "Proposal Review" stage (see decision above). Resolved by making the test
  data-driven on stable anchors.

## Next Steps

- Optional: make `CLOSED_WINDOW_DAYS` admin-configurable via `appSetting`.
- Optional: paginate the Closed deals view if closed volume grows large.

## Related Files

- `src/app/(app)/pipeline/page.tsx` (windowed query, heading link)
- `src/components/pipeline-board.tsx` (collapsible Won / Lost columns)
- `src/lib/deal-values.ts` (new, extracted helpers)
- `src/app/(app)/pipeline/closed/page.tsx` (new, server route)
- `src/components/closed-deals-list.tsx` (new, client filters)
- `e2e/pipeline.spec.ts`, `e2e/won-lost.spec.ts`, `e2e/closed-deals.spec.ts`
- Continues work from `2026-06-23` configurable deal statuses and `2026-06-17`
  pipeline card hover tooltip logs (same board files).
