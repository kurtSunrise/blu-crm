# Work Log: Deal-timeline relative-day hover tooltip

**Agent**: Claude Code (Opus 4.8, 1M context)
**Session ID**: a73f36e6-ef7d-402c-a98b-6f2e88989579
**Mode**: Feature implementation
**Date**: 2026-07-08T05:40:22Z

## Task Description
On the deal page (`/deals/[id]`) timeline, hovering an activity row should show a
tooltip with how long ago it happened relative to today (e.g. "5 days ago"). Applied
to all activity rows plus the "Lead created" footer marker; tooltip is relative-only
since the exact timestamp already appears on the row.

## Actions Taken
- `src/components/deal-timeline.tsx`: promoted to a client component (`"use client"`),
  added a small top-level `RelativeDayTooltip` helper, and wrapped each `TimelineItem`
  content container and the footer marker as tooltip triggers.
- Reused the existing `formatRelativeDayAwst` helper (`src/lib/format.ts`) and the Base
  UI `Tooltip` primitives (`src/components/ui/tooltip.tsx`); the app-wide
  `TooltipProvider` in `app-shell.tsx` already covers this surface.
- Added a `cursor-help` affordance to the hover targets.
- `src/app/(app)/help/page.tsx`: added a "What's new" item under the existing
  08/07/2026 entry describing the timeline hover tooltip.

## Decisions Made
- Client component over a narrower wrapper: the change now covers every row, and the
  file is purely presentational with serializable props, so promoting the whole file is
  the simplest correct option.
- Relative wording computed on the client at render — the string only appears in the
  hover popup (a portal), so there is no meaningful SSR/hydration concern.

## Issues Encountered
- None.

## Verification
- `npm exec -- ultracite check` clean; `tsc --noEmit` clean; `npm run build` passed.
- Live check via Chrome against `npm run dev`: a note row (17/06/2026) showed
  "21 days ago" and the "Lead created" footer (16/06/2026) showed "22 days ago",
  both correct against 08/07/2026.
- No new e2e added — presentational, non-flow change; existing row content and links
  are unchanged.

## Next Steps
- None. Committed to `main` and deployed to production via local `npm run deploy`.
