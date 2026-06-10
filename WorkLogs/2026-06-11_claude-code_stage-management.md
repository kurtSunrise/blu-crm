# Work Log: Customisable Pipeline Stages (FR-1.3)

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: cse_01WsDKrW9UJW7aBbMFBca1nW
**Mode**: Implementation (autonomous)
**Date**: 2026-06-11T12:45:00+08:00
**Duration**: ~1 hour

## Task Description

Follow-on from the settings rebuild (same session): user approved adding
pipeline stage management. FR-1.3: admins can rename, reorder, add, or
remove stages; renaming preserves deal history; removing a stage requires
reassigning its deals.

## Actions Taken

- **Server actions** (`src/lib/actions/stage-actions.ts`): a single
  `manageStages` dispatcher (one status line in the UI) with add, rename,
  move, and delete intents. Guards: duplicate names rejected
  (case-insensitive); Won / Lost / Dormant can be renamed but not removed
  and never reorder across the open/closed boundary; at least one open
  stage must remain; new stages slot in ahead of Won; positions compact
  to 1..n after a delete. Deleting a stage with deals (counting discarded
  ones, which still hold the FK) requires a reassignment destination and
  moves them first. Revalidates /, /pipeline, /tasks, /reports,
  /reports/weekly, /settings.
- **Stage name validation** added to `src/lib/validation/settings.ts`
  (trimmed, 1 to 60 chars).
- **UI** (`src/components/stage-manager.tsx`): a "Pipeline stages" card on
  /settings (left column, above Forecast weightings) listing stages in
  order with position, deal count, Won/Lost badges, and 44px icon actions:
  up/down reorder, inline rename panel, and a delete confirm panel that
  shows a reassignment select when deals exist. Success auto-closes panels
  and resets the add form.
- Settings page query now left-joins deal counts per stage; loading
  skeleton updated for the new left column.
- **E2E** (`e2e/stage-management.spec.ts`): add/rename/reorder/remove
  lifecycle (verifying the new stage appears as a board column),
  delete-with-deals reassignment back to Lead Captured (deal verified on
  the board afterwards), and Won/Lost having no remove button. Tests only
  touch stages they create, so the eight defaults other specs rely on are
  safe under the 3-project parallel run. `global-setup.ts` now also drops
  non-default stages left behind by failed runs.
- 108/108 E2E passing (was 99; 3 new tests x 3 projects); ultracite and
  `npm run build` clean.

## Decisions Made

- Checked first: nothing in code depends on stage names. Intake picks the
  lowest-position stage, and close flows / reports key off is_won /
  is_lost flags, so rename and reorder are safe; only deal.stage_id
  references stages, so delete needs nothing beyond deal reassignment.
- Up/down buttons instead of drag-and-drop: deterministic, testable, and
  workshop-glove friendly; stage reordering is rare enough not to need DnD.
- Reorder assertion in E2E is the success status, not absolute order:
  parallel projects interleave their own temp stages so absolute indexes
  are not stable across workers.

## Issues Encountered

- Local Postgres cluster was down on the second test run (ECONNREFUSED
  5432); restarted via `service postgresql start`.
- Playwright's 60s webServer timeout was too short for a cold `next dev`
  on this filesystem; started the dev server manually and let
  `reuseExistingServer` pick it up.

## Next Steps

- Auth (resume from `claude/auth-parked`); stage management should become
  admin-only once roles are enforced.
- Stage delete reassignment could later offer a per-deal split instead of
  one destination, if that ever matters in practice.

## Related Files

- src/lib/actions/stage-actions.ts (new)
- src/components/stage-manager.tsx (new)
- src/app/(app)/settings/page.tsx, src/app/(app)/settings/loading.tsx
- src/lib/validation/settings.ts
- e2e/stage-management.spec.ts (new), e2e/global-setup.ts
