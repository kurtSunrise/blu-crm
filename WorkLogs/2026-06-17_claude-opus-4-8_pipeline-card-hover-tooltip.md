# Work Log: Configurable hover tooltip on pipeline deal cards

**Agent**: Claude Opus 4.8 (claude-opus-4-8)
**Session ID**: N/A
**Mode**: Plan then implement (feature work)
**Date**: 2026-06-17T00:00:00Z
**Duration**: single session

## Task Description
Add a hover preview to deal cards on the pipeline board that shows more about a
deal without opening it. The preview is mouse-only (Base UI tooltip, hover and
focus). It can be turned on or off, and the individual fields it shows are
configurable from a new Settings section. Confirmed fields: scope summary, last
contact and expected close date, and the next open follow-up.

## Actions Taken
- New `src/lib/pipeline-tooltip.ts`: keys, defaults (all on), and
  `getPipelineTooltipSettings()`, mirroring `src/lib/alerts.ts`.
- `src/lib/validation/settings.ts`: added `pipelineTooltipSettingsSchema`.
- `src/lib/actions/settings-actions.ts`: added `updatePipelineTooltipSettings`,
  upserting each flag as its own `app_setting` row; revalidates `/settings` and
  `/pipeline`.
- New `src/components/pipeline-tooltip-form.tsx`: master checkbox plus three
  field checkboxes (kept submittable when the master is off so choices survive).
- `src/app/(app)/settings/page.tsx`: new "Pipeline card details" section.
- `src/app/(app)/pipeline/page.tsx`: fetch settings; select scopeSummary,
  lastContactAt, expectedCloseDate; query the soonest open follow-up per deal
  only when that field is enabled; pass `tooltip` to the board.
- `src/components/pipeline-board.tsx`: extended `BoardDeal`, threaded the
  `tooltip` config, wrapped the board in a `TooltipProvider` with a 400ms delay.
- `src/components/deal-card.tsx`: build rows from enabled-and-present fields and
  wrap the card body in a tooltip; suppressed while dragging.

## Decisions Made
- Storage as separate string keys (not JSON) to match the existing alert/weighting
  pattern.
- Field checkboxes stay submittable when the master is off; a disabled fieldset
  would drop their values on save.
- Delay set via a board-scoped `TooltipProvider`, because the Base UI tooltip
  root in this version does not accept a `delay` prop (it lives on the provider).
- Follow-up query is skipped entirely when the follow-up field (or whole tooltip)
  is off, so the board pays no extra query cost when the feature is unused.

## Issues Encountered
- A stray nested `biome.jsonc` under `.kilo/worktrees/...` breaks a repo-wide
  `ultracite` run; scoped lint/format to the changed files instead.
- Could not complete the logged-in browser verification: the e2e default seed
  password (`blu-crm-dev`) is rejected on the shared Neon DB and no
  `SEED_USER_PASSWORD` is set locally. Did not guess credentials.

## Verification
- `npx tsc --noEmit`: clean.
- `ultracite check` on all changed files: clean.
- New Playwright spec `e2e/pipeline-tooltip.spec.ts` (run on the desktop
  project): both tests pass. One asserts the new settings controls render and
  save; the other quick-adds a lead, gives it a follow-up, then hovers the card
  on the board and confirms the "Next follow-up" preview appears. Run with
  `npx dotenv -e .env.local -- playwright test e2e/pipeline-tooltip.spec.ts
  --project=desktop` (the bare `playwright test` script does not load
  `.env.local`, so `SEED_USER_PASSWORD` would be missing).
- Added `aria-label` to the three field checkboxes for clean accessible names
  (the wrapping label otherwise folds the hint text into the name).
- Deployed to prod via local `npm run deploy` (Paid account, kurt-0f6); live
  `/sign-in` returns 200 and `/pipeline` 307→/sign-in on a cache-busted load.

## Next Steps
- None outstanding. The hover preview is desktop-only by design; the Playwright
  test skips the phone/tablet projects accordingly.

## Related Files
- src/lib/pipeline-tooltip.ts
- src/lib/validation/settings.ts
- src/lib/actions/settings-actions.ts
- src/components/pipeline-tooltip-form.tsx
- src/components/deal-card.tsx
- src/components/pipeline-board.tsx
- src/app/(app)/settings/page.tsx
- src/app/(app)/pipeline/page.tsx
