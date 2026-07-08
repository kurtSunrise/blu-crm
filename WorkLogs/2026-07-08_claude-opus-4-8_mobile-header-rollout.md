# Work Log: Roll out the pipeline mobile-header pattern site-wide

**Agent**: Claude Opus 4.8 (1M context) (claude-opus-4-8[1m])
**Session ID**: 0d1a0aac-9eb3-47da-a5d2-b8d987025f57
**Mode**: Interactive (implementation)
**Date**: 2026-07-08T00:00:00Z

## Task Description

The pipeline page header was compacted for phones in commit `52fd70d` (title +
Board/Closed pills on one row, shrunk h1, tighter mobile py/gap, sticky
horizontally-scrollable status filters). The request: apply the same mobile best
practices to the rest of the site, then note it in the Help "What's new" list.

## What the pipeline pattern actually was (source of the rollout)

- h1 shrink `text-2xl` -> `text-xl md:text-2xl` — already global in `PageHeader`,
  so every page already had it. No action needed.
- Sub-nav merged into `PageHeader`'s `actions` slot — pipeline-specific (2 short
  pills). Not generalized (Reports has 6 pills; cramming them next to the title
  would be worse than a dedicated row).
- Sticky horizontally-scrollable filter chips — contacts already has this
  (`contacts-directory.tsx`); pipeline replicated it. Not otherwise generalized.
- Tighter mobile vertical rhythm on `<main>` — the transferable universal win.

## Actions Taken

- **Mobile vertical rhythm** on 21 in-shell page `<main>` containers: `py-6` ->
  `py-4 md:py-6`, `gap-6` -> `gap-5 md:gap-6`, `gap-8` -> `gap-6 md:gap-8`
  (desktop pixel-identical, phones reclaim top/section space). Applied via a
  per-`<main>`-line perl transform, excluding the already-optimized pipeline
  pages. Files: dashboard, calendar, tasks, inbox, notifications, contacts (+
  new/[id]/[id]/edit), deals (new/[id]), companies ([id]/[id]/edit), help, and
  all 7 reports pages. Settings uses its own layout and was left as-is this pass.
- **`PillNav` (`src/components/pill-nav.tsx`)**: mobile pills now sit in a single
  swipeable row (`flex gap-2 overflow-x-auto md:flex-wrap md:overflow-visible`,
  pills `shrink-0 whitespace-nowrap`) instead of wrapping onto 2-3 lines. Biggest
  beneficiary is the 6-pill Reports nav; the 2-pill pipeline nav is unaffected
  visually. Same links / aria-current / query behaviour.
- **Help "What's new"**: added a bullet to the existing 08/07/2026 entry
  describing the roomier phones layout and the swipeable Reports view switcher.

## Decisions Made

- Reduced churn/risk by scoping the rhythm change to the `<main>` line only and
  anchoring the regex with a negative lookbehind for `:` so existing `md:*`
  variants were never doubled. Ran `ultracite fix` afterward to re-sort classes.
- Did NOT make the Reports nav sticky. The pipeline's sticky filters solve
  "filter a very tall kanban column"; report pages don't have that need and a
  half-sticky nav above non-sticky filters would look odd. Left as an optional
  follow-up if wanted.
- Left Settings layout untouched (distinct two-column shell; separate pass).

## Issues Encountered

- The `gap-8` -> `gap-6` rule cascaded into the freshly-inserted `gap-6` on the
  help page (`gap-5 md:gap-6 md:gap-8`); corrected to `gap-6 md:gap-8`.
- zsh does not word-split unquoted vars; the first loop attempt fed the whole
  file list to perl as one path and changed nothing. Redone with `while read`.
- Browser visual check couldn't reach a sub-768px viewport (Chrome window
  min-width clamps; the extension viewport stayed desktop-sized). Verified the
  desktop render is unregressed and relied on the Playwright phone project
  (Pixel 7) for the true mobile check.

## Verification

- `npm exec -- ultracite check`: clean (363 files).
- `npm run build`: clean.
- `npx playwright test reports.spec.ts pipeline.spec.ts mobile-nav.spec.ts
  --project=phone`: 10 passed, 3 failed. Isolated the failures against a stashed
  baseline: `reports.spec.ts:100` (daily status) fails on baseline too
  (pre-existing environmental/data flake); `reports.spec.ts:47` and
  `pipeline.spec.ts:101` are data-mutating write-flow tests that pass in
  isolation with the changes applied — the full-spec failures were shared-DB
  state flakiness, not this change. CSS-only class edits cannot affect those
  write assertions.

## Next Steps

- Optional: give the Reports nav (and other long report pages) the sticky
  treatment if the team wants the switcher pinned while scrolling.
- Optional: same mobile-rhythm pass on the Settings layout shell.
- Changes are uncommitted in the working tree; not deployed.

## Related Files

- src/components/pill-nav.tsx
- src/app/(app)/help/page.tsx (What's new entry)
- 21 page.tsx `<main>` containers (dashboard, calendar, tasks, inbox,
  notifications, contacts*, deals*, companies*, help, reports*)
- src/components/page-header.tsx, src/components/contacts-directory.tsx (pattern
  references, unchanged)
