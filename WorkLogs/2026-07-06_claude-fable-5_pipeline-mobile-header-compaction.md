# Work Log: Pipeline mobile header compaction

**Agent**: Claude Fable 5 (claude-fable-5)
**Session ID**: cd2ed73d-99f4-44d2-a69d-ee76e10d9816
**Mode**: Interactive (plan mode, then implementation)
**Date**: 2026-07-06T03:20:43Z

## Task Description

On phones, the Pipeline page header stack (the "Pipeline" title, the Board/Closed pill nav, and the wrapping status filter chips) consumed roughly 270 to 300px of viewport before the first deal card, and none of it stayed reachable while scrolling. Compacted it following the contacts-toolbar precedent (`src/components/contacts-directory.tsx`), reclaiming roughly 100 to 125px and keeping the filters sticky.

## Actions Taken

- Merged the title row and the Board/Closed pill nav into one row via `PageHeader`'s existing `actions` slot on both `/pipeline` and `/pipeline/closed`; dropped the now-single-child wrapper flex classes; tightened `main` to `gap-3 py-3 md:gap-4 md:py-6`.
- Shrank the shared `PageHeader` h1 to `text-xl md:text-2xl` (global, mobile-only; desktop pixel-identical).
- Wrapped the status filter fieldset in `pipeline-board.tsx` in a sticky scroll container: `sticky top-14 z-10 overflow-x-auto bg-background/95 backdrop-blur md:top-0`, chips `shrink-0 whitespace-nowrap`, `md:flex-wrap` restoring wrap on desktop. The overflow lives on a wrapping div because the fieldset UA `min-inline-size: min-content` defeats shrinking. Filter state and fieldset/legend/`aria-pressed` semantics unchanged.
- Verification: `ultracite check` clean, `npm run build` clean, Playwright pipeline-area specs (pipeline, sub-status, won-lost, closed-deals, accessibility) green per project across runs (details below), plus authenticated Playwright screenshots at 390x844 and 1440x900 confirming the layout and the sticky bar.

## Decisions Made

- Followed the existing contacts sticky-toolbar pattern instead of inventing scroll-collapse behavior; no new hooks or components, no PillNav API change, no state lifting.
- Made the h1 shrink global to `PageHeader` (all pages) rather than a pipeline-only prop, for cross-page consistency in a mobile-first product.
- Desktop now shows the Board/Closed pills right of the title instead of below it; accepted as a small improvement over duplicating markup per breakpoint.
- Only the filter row is sticky, not the title row, so scroll reclaims the title space but filters stay reachable.

## Issues Encountered

- **Stale e2e DB flag**: `app_setting.sub_status_show_board` had been `'false'` in the shared e2e/dev Neon DB (ep-quiet-butterfly) since 2026-06-23, which hides every card's "Add status" control and makes `sub-status.spec.ts` fail on all projects regardless of code. Restored it to `'true'`.
- **Stale dev server**: the long-lived `npm run dev` had HMR-drifted through the edits and was emitting `ChunkLoadError` for its own chunks, breaking hydration and mass-failing phone interaction tests. Killed it, removed `.next`, and re-ran fresh; the failures cleared.
- Residual failures across runs were the documented environment flakes: cold-compile `page.goto` timeouts and the known WebKit tablet goto hang. On a warm server the phone project passed 15/15 (including pipeline a11y light + dark); desktop and tablet passed everything except one tablet `sub-status` run that died on a plain `page.goto("/pipeline")` navigation (known flake; the same flow passed on tablet in an earlier run).

## Next Steps

- Optional follow-up: give the closed-deals toolbar (`src/components/closed-deals-list.tsx`) the same scrollable-controls treatment; it mixes chips, selects, and search, so it needs its own layout pass.
- If a pipeline/sub-status phone test ever flakes on click interception under the sticky bar, add `scroll-mt-24` to the deal card article.
- Changes are uncommitted in the working tree; not deployed.

## Follow-up (same session)

- Added a 06/07/2026 entry to the help page's What's new list (`WHATS_NEW` in `src/app/(app)/help/page.tsx`) covering the compact pipeline header and, since it was also missing, the phone bottom-bar More tab shipped earlier today (commit df49bd2). Lint and build re-verified.

## Related Files

- src/components/page-header.tsx
- src/app/(app)/pipeline/page.tsx
- src/app/(app)/pipeline/closed/page.tsx
- src/components/pipeline-board.tsx
- src/components/contacts-directory.tsx (pattern reference, unchanged)
