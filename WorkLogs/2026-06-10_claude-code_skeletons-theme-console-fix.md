# Work Log: Skeleton loading states + theme script console fix

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: N/A
**Mode**: Implementation (same session as m5-reports)
**Date**: 2026-06-10T00:00:00+08:00

## Task Description

Two user requests mid-session: (1) every page should show a skeleton UI on
load — document in the PRD and implement; (2) fix the dev console error
"Encountered a script tag while rendering React component" coming from
next-themes under React 19.2.

## Actions Taken

- PRD §9.1: added the requirement that every server-rendered route shows an
  immediate skeleton loading state via App Router `loading.tsx`.
- Added `src/components/ui/skeleton.tsx` (shadcn primitive) and
  `src/components/page-skeletons.tsx` (SkeletonShell/Header/Stats/List/
  Board/Form building blocks, server components, sr-only "Loading…" status).
- Added `loading.tsx` for every dynamic route: (app) root, pipeline,
  contacts, contacts/[id], deals/[id], deals/new, inbox, tasks,
  notifications, reports, reports/weekly, settings, settings/import, and
  (public) q/[token]. Static pages (help, enquire, contacts/new) prerender
  and need none.
- Per user direction, each skeleton mirrors its page's real layout: the
  `<main>` container classes are copied verbatim from the page, and the
  structure matches (pipeline gets full-bleed snap columns at the board's
  85vw/20rem widths, contacts gets the People/Companies split, deal detail
  gets the record + timeline grid, settings gets the two-field thresholds
  plus eight weighting fields, and so on).
- `theme-provider.tsx`: dev-only filter for the single React 19.2 false
  positive about next-themes' inline theme bootstrap script. next-themes is
  unmaintained (last release 2025-03; the 1.0.0 beta predates the issue), and
  the script does execute — from the server HTML before hydration. Real
  console errors still surface. Remove the filter if next-themes is replaced.

## Decisions Made

- Suppression scoped to the exact message and development only, following
  the repo's precedent of silencing known dev false positives
  (suppressHydrationWarning on body, commit 404ccac).
- Skeleton keys use precomputed stable strings (Biome forbids array-index
  keys).

## Issues Encountered

- E2E verification is environmentally flaky: `.env.local`'s DATABASE_URL
  points at remote Neon (ap-southeast-2), so the Playwright global-setup
  data wipe is skipped (localhost-only safety check) and test data
  accumulates; parallel runs intermittently hit
  `NeonDbError: fetch failed`. Reports/won-lost/smoke specs pass when run
  in isolation; full-suite failure sets differ every run. Recommend a local
  Postgres for E2E (`src/db/index.ts` already switches drivers on a
  localhost URL).
- `EMAIL_INTAKE_TOKEN` was missing from `.env.local` (intake tests 503'd);
  added the value the spec expects.

## Next Steps

- Consider a local Postgres for deterministic E2E runs.
- Revisit the console filter if next-themes ships a React 19.2 fix or is
  replaced.

## Related Files

- `PRD.md` (§9.1)
- `src/components/ui/skeleton.tsx`, `src/components/page-skeletons.tsx`
- `src/app/(app)/**/loading.tsx` (13 files), `src/app/(public)/q/[token]/loading.tsx`
- `src/components/theme-provider.tsx`
