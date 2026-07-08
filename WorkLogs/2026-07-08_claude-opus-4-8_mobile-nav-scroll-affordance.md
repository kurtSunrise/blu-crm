# Work Log: Mobile-UX polish for the scrollable page-header sub-nav

**Agent**: Claude Opus 4.8 (1M context) (claude-opus-4-8[1m])
**Session ID**: 0d1a0aac-9eb3-47da-a5d2-b8d987025f57
**Mode**: Interactive (plan mode, then implementation)
**Date**: 2026-07-08T00:00:00Z

## Task Description

Follow-up to `2026-07-08_claude-opus-4-8_mobile-header-rollout.md`. The user asked
whether the new page-header/sub-nav pattern actually follows mobile UX best
practices. An audit found the layout economy was sound but the switch from
wrapping to `overflow-x-auto` introduced two discoverability problems and left a
consistency gap. The user chose to fix three of the four identified gaps (touch
targets deliberately left as-is to preserve compaction).

## Gaps addressed

1. **No horizontal-scroll affordance** — pill rows and the pipeline status-filter
   row clipped at the edge with no cue they scrolled sideways.
2. **Active pill could be hidden off-screen** — `PillNav` was a server component
   with no scroll-into-view, so on `/reports/daily` the active "Daily" pill (6th
   of 6) could render off the right edge.
3. **Sticky inconsistency** — the Reports sub-nav scrolled away while the
   pipeline status chips and contacts toolbar stay pinned.

Deferred by user decision: enlarging touch targets to 44px (pills `min-h-9`,
chips `min-h-8`).

## Actions Taken

- **New `src/components/scroll-row.tsx`** (`"use client"`, the only new client
  code): a presentational horizontal scroll container that (a) scrolls its
  `[aria-current="page"]` child into view on mount (instant, `inline/block:
  "nearest"` so the page never jumps), and (b) sets `data-overflow=
  none|start|end|both` from scroll position via an `onScroll` listener +
  `ResizeObserver`, mapped to a mobile-only `mask-image` edge fade
  (`md:[mask-image:none] md:overflow-visible` so desktop wrap is untouched).
  Callers own semantics + layout via `className`.
- **`pill-nav.tsx`**: wrapped the pills in `<ScrollRow>` inside the existing
  `<nav>`; kept `md:flex-wrap`. Active-into-view works off the existing
  `aria-current="page"` with no new props. Benefits ReportsNav (6 pills);
  harmless for PipelineNav (2 pills).
- **`reports/reports-nav.tsx`**: wrapped `PillNav` in the contacts sticky pattern
  `sticky top-14 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur md:top-0`,
  pinning the switcher on all 8 report pages with no per-page edits.
- **`pipeline-board.tsx`**: replaced the hand-rolled `overflow-x-auto` on the
  sticky filter wrapper with `<ScrollRow>` (kept the sticky/bg/backdrop outer
  div). Adds the edge fade; active-into-view no-ops (chips use `aria-pressed`).
- **`help/page.tsx`**: refined the existing 08/07/2026 What's-new bullet to note
  the edge fade, active-into-view, and the pinned Reports switcher.
- **`e2e/mobile-nav.spec.ts`**: added a phone-project test asserting the active
  "Daily" pill is `toBeInViewport()` on `/reports/daily` — guards the
  active-into-view behavior against silent regression.

## Decisions Made

- One shared `ScrollRow` primitive for both the nav and the filter row, so the
  affordance is defined once (reuses the contacts sticky pattern and the board's
  snap/peek precedent rather than reinventing).
- JS-driven, side-aware edge fade (not a static both-edges mask) to avoid the
  "left edge faded at rest" look; piggybacks on the client effect already needed
  for active-into-view.
- Kept `PillNav` a server component — only `ScrollRow` is client — by having
  ScrollRow read `aria-current` from the DOM instead of taking an active prop.

## Verification

- `npm exec -- ultracite check`: clean (365 files). `npm run build`: clean.
- Playwright **phone** project (Pixel 7 — local browser windows can't be forced
  below the 768px `md` breakpoint, so the phone project is the real mobile check):
  `reports.spec.ts pipeline.spec.ts mobile-nav.spec.ts` → all relevant tests
  pass on a warm server, including the new active-into-view test.
- Isolated the two transient failures seen mid-run against a stashed baseline:
  `reports.spec.ts:100` (daily status) fails on baseline too (known
  environmental/data flake); the `mobile-nav.spec.ts:23` More-tab failure was
  dev-server cold-compile contention (the new test also hits reports routes; both
  compile in parallel under 2-3 workers and blow the 5s `toHaveURL` timeout) — it
  passes 2/2 on baseline and 1/1 warm with the changes.

## Next Steps

- Optional (declined this pass): raise pill/chip/back-link tap targets toward
  44px if the team prefers tappability over maximum compaction.
- Changes are uncommitted in the working tree; not deployed. Combine with the
  prior rollout when committing.

## Related Files

- src/components/scroll-row.tsx (new)
- src/components/pill-nav.tsx
- src/components/reports/reports-nav.tsx
- src/components/pipeline-board.tsx
- src/app/(app)/help/page.tsx
- e2e/mobile-nav.spec.ts
- src/components/contacts-directory.tsx (sticky pattern reference, unchanged)
