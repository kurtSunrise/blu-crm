# Work Log: Pipeline deal sub-statuses (On Hold / Blocked labels)

**Agent**: Claude Opus 4.8 (Claude Code)
**Session ID**: N/A
**Mode**: Feature implementation
**Date**: 2026-06-18

## Task Description

Give the team a way to flag deals that cannot progress because of an external
dependency, without moving them out of their pipeline stage. A deal can carry an
optional sub-status label (On Hold / Blocked) plus a short note explaining why.
The label is visible on the board card, settable from the card and the deal
page, the board can be filtered by it, and reports show how many deals are
currently on hold or blocked.

Scope confirmed with the user: a fixed enum of four labels, board filter, and a
reporting metric. Stale-hold reminders / scheduled notifications were explicitly
left out of this build.

## Actions Taken

- Added the `dealSubStatus` pgEnum and three nullable columns (`subStatus`,
  `subStatusNote`, `subStatusSetAt`) to the `deal` table in `src/db/schema.ts`;
  pushed with `npm run db:push`.
- Added `SUB_STATUSES` and `setDealSubStatusSchema` to
  `src/lib/validation/deal.ts`; `SubStatus`, `SUB_STATUS_LABELS`, and
  `SUB_STATUS_TONE` to `src/lib/labels.ts`.
- Added the `setDealSubStatus` server action in
  `src/lib/actions/deal-actions.ts`: updates the columns, stamps
  `subStatusSetAt` only when the label changes, logs a timeline activity
  (type `note`), and revalidates `/pipeline`, `/reports`, `/deals/[id]`.
- New client component `src/components/deal-sub-status-control.tsx`: a badge that
  opens a dialog to pick a label, add a note, or clear it. Reused on the board
  card and the deal page.
- Wired into the card (`src/components/deal-card.tsx`), the `BoardDeal` interface
  and a board status filter (`src/components/pipeline-board.tsx`), the pipeline
  query (`src/app/(app)/pipeline/page.tsx`), and the deal header
  (`src/app/(app)/deals/[id]/page.tsx`).
- Added `getSubStatusBreakdown()` to `src/lib/reports.ts` and an
  "On hold / blocked" section to `src/app/(app)/reports/page.tsx`.
- New Playwright spec `e2e/sub-status.spec.ts` covering the full lifecycle:
  apply label + note, board filter, reports count, and clear.

## Decisions Made

- Fixed `pgEnum` (mirroring `lostReason`) rather than an admin-customizable
  table — the four labels are stable and this matched the existing pattern with
  far less surface area. Changing the set later is a one-line enum edit.
- The label is independent of the pipeline stage and persists across stage
  moves; it is only changed/cleared explicitly through the control.
- The note rides along as the badge's hover `title`; the label change is logged
  to the timeline for audit, reusing the `activity` table (no new table).
- Board filtering is done client-side over the already-loaded deals (no extra
  query); stage counts and totals recompute from the filtered list.

## Issues Encountered

- No `Popover` primitive exists in `src/components/ui/`, so the control uses the
  existing `Dialog` (same approach as `StageChangeDialog`).
- Per the workspace dash rule, used a colon rather than a dash as the separator
  in the logged activity string.

## Verification

- `npm exec -- ultracite check` on all changed files plus the new spec: clean.
- `npm run db:push`: enum + columns applied to the Neon dev DB.
- `npm run build`: succeeded.
- `npx playwright test e2e/sub-status.spec.ts --project=desktop`: 1 passed
  (after clearing a stale `next dev` that was holding port 3000).

## Next Steps

- On deploy, run `npm run db:push:prod` against the prod Neon DB before
  `npm run deploy` (local, Paid account) per the deployment notes.
- Optional nice-to-have not built: stale-hold reminders (notify when a deal has
  been on hold longer than X days) — `subStatusSetAt` is already stored to
  support this later.
- Optional: expose `subStatus` to the AI `get_deal` tool so the assistant can
  read/flag held deals.

## Follow-up: colour-coded flags (2026-06-22)

Replaced the two-tone `SUB_STATUS_TONE` (grey/red) with a distinct colour per
label for faster visual scanning, confirmed with the user:

- On Hold – Awaiting Third Party → amber
- Blocked – External Dependency → red (semantic `destructive`)
- On Hold – Awaiting Client → teal
- On Hold – Internal Review → violet (brand `blu` reserved for links/active state)

New `SUB_STATUS_COLOR: Record<SubStatus, { badge; dot }>` in `src/lib/labels.ts`
(full literal class strings so Tailwind generates them; soft `bg-*/10 text-*`
style with -700/-400 tones for AA in both themes). Applied to the card/page
badge and dialog radio dots (`deal-sub-status-control.tsx`), the board filter
chips — leading colour dot always, active chip in the label's colour
(`pipeline-board.tsx`), and the reports breakdown rows
(`src/app/(app)/reports/page.tsx`).

Verified: `ultracite check` clean, `npm run build` clean, and
`e2e/sub-status.spec.ts` still passes (locators are by accessible name/text,
unchanged). Not yet deployed — see the prod-DB note below.

### ⚠ Production DB correction

The earlier assumption that the live Worker shares the `.env.local` dev DB was
**wrong** (memory corrected): `kurt-0f6` uses its own prod Neon DB
(`ep-snowy-rain`) via a secret. The sub-status enum + columns were only pushed
to the dev DB, so `/pipeline` and `/reports` likely error in production until the
prod DB is migrated separately (there is no `.env.production` in the repo). This
must be resolved before the feature — colours included — works live.

## Related Files

- `src/db/schema.ts`
- `src/lib/validation/deal.ts`
- `src/lib/labels.ts`
- `src/lib/actions/deal-actions.ts`
- `src/components/deal-sub-status-control.tsx`
- `src/components/deal-card.tsx`
- `src/components/pipeline-board.tsx`
- `src/app/(app)/pipeline/page.tsx`
- `src/app/(app)/deals/[id]/page.tsx`
- `src/lib/reports.ts`
- `src/app/(app)/reports/page.tsx`
- `e2e/sub-status.spec.ts`
