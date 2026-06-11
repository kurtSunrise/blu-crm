# Work Log: Calendar view, deals UI polish, help-doc update

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: 2a4f940a-d85e-4e3e-a995-9b577ce87558
**Mode**: Plan-then-implement
**Date**: 2026-06-11T21:30:00+08:00

## Task Description
Add a month-view Calendar showing the dates that decide how busy the team is
(fixed install/event/launch dates, expected closes, follow-up due dates),
polish the deals surfaces (pipeline board, deal cards, deal detail), and
update the Help page (new Calendar section plus pre-existing gaps:
attachments, reports, light mode).

## Actions Taken
- New `/calendar` route (`src/app/(app)/calendar/page.tsx`): fully
  server-rendered month grid + per-day agenda, zero new dependencies and zero
  `"use client"`. Month navigation via `?month=YYYY-MM` links; phone day cells
  anchor-link to the agenda below. Three bounded queries per month (fixed
  dates, expected closes, open follow-ups).
- New `src/components/calendar-month.tsx` (grid, agenda, legend) and
  `src/lib/calendar.ts` (AWST-correct month/day key maths).
- `src/lib/format.ts`: exported `AWST_OFFSET_MS`; added `awstDayDiff`,
  `relativeDayLabel`, `formatRelativeDayAwst`.
- `src/lib/labels.ts`: added `FIXED_DATE_TYPE_LABELS` / `FixedDateType`.
- Nav (`src/components/app-shell.tsx`): Calendar added to the sidebar after
  Pipeline; on phones Calendar takes the bottom-tab slot previously held by
  Contacts (user-approved; Contacts stays reachable from the dashboard, same
  precedent as Reports).
- Rebase reconciliation with the parallel M5 dashboard rewrite (which removed
  the module-card grid this change originally extended): Calendar and
  Contacts links added to the new dashboard's footer so both remain reachable
  on phones. Worth revisiting whether Contacts deserves a more prominent
  dashboard entry point.
- Deals polish: deal cards label fixed dates (Install/Event/Launch), colour
  them by urgency (overdue red / ≤14 days amber) with a relative-day hint;
  pipeline columns got count pills, tabular numerals, clearer drop feedback,
  and a dashed empty placeholder; deal detail leads with a "Key dates" strip
  (fixed date, expected close, next follow-up — fixed/close tiles link to that
  month on the calendar) and overdue follow-ups show in red.
- Help page: new sections Calendar, Files and photos, Reports and the
  dashboard, Light and dark mode; new FAQ and glossary entries; new What's
  new entry dated 11/06/2026.
- New `e2e/calendar.spec.ts` (agenda contents + deal links; month navigation).

## Decisions Made
- **Closed-deal calendar policy**: Won deals keep their fixed date on the
  calendar (the install still happens); Lost/Dormant deals are hidden;
  `expectedCloseDate` is hidden once `closedAt` is set.
- **Colours**: fixed = `warning` (amber), expected close = `blu`, follow-up =
  `success`; `destructive` stays reserved for overdue, matching the tasks
  page.
- **Custom calendar over a library**: it is an event overview, not a date
  picker; Perth has no DST so the day maths is a fixed +8 h shift on existing
  utilities.

## Issues Encountered
- The stage-column count pill initially sat inside the `<h2>`, changing the
  accessible name and breaking `pipeline.spec.ts`'s exact heading match —
  moved it out of the heading.
- **Suite-wide e2e flake confirmed and characterised**: clicks fired right
  after a navigation can be silently dropped while React hydrates or
  re-renders (e.g. submitting a second follow-up immediately after the first
  one's `router.refresh`). Reproduced deterministically with a manual probe
  (first link click after load does nothing; same click after a settle
  works). This pre-dates this change set: `follow-ups.spec.ts`,
  `pipeline.spec.ts:62`, `intake.spec.ts`, and `quotes.spec.ts` fail
  intermittently on main's build too, and the quote/follow-up flows work when
  given a hydration settle. `e2e/calendar.spec.ts` defends itself with
  retry-until-URL-moves (`expect(...).toPass`) around such clicks; the older
  specs would benefit from the same pattern (not done here — out of scope).
- Parallel projects against the remote Neon dev DB push server actions past
  the 5 s expect timeout; serial runs (`--workers=1`) are far more stable.

## Verification
- `npm exec -- ultracite check` — clean.
- `npm run build` — passes; `/calendar` registered.
- Full Playwright suite, serial, against a production build: 85 passed /
  14 failed; **every spec touched by this change passed on all three
  projects** (calendar, pipeline, smoke, help-and-theme, contacts;
  follow-ups passed on phone + desktop). All 14 failures are the
  pre-existing dropped-click/latency flake in intake, quotes, and follow-ups
  flows (see above; also fail on main).

## Next Steps
- Consider applying the `toPass` click-retry pattern to the older flaky
  specs (follow-ups, quotes, intake, pipeline log-a-call).
- Future index candidates if the calendar grows: `deal.fixed_date`,
  `follow_up.due_date` (month-bounded queries are fine at current scale).
- Quick add still has no `fixedDateType` / `expectedCloseDate` fields; the
  calendar handles their absence, but capturing them at intake would make it
  more useful.

## Related Files
- src/app/(app)/calendar/page.tsx (new)
- src/components/calendar-month.tsx (new)
- src/lib/calendar.ts (new)
- e2e/calendar.spec.ts (new)
- src/lib/format.ts, src/lib/labels.ts
- src/components/app-shell.tsx, src/app/(app)/page.tsx
- src/app/(app)/pipeline/page.tsx, src/components/pipeline-board.tsx,
  src/components/deal-card.tsx, src/app/(app)/deals/[id]/page.tsx
- src/app/(app)/help/page.tsx
