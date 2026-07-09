# Work Log: Accurate and configurable "Deal needs attention" nudges

**Agent**: Claude Opus 4.8 (1M context)
**Session ID**: N/A
**Mode**: Plan then implement (data-layer / notifications / settings UI)
**Date**: 2026-07-09T00:00:00Z

## Task Description

Make the "Deal needs attention" (stale-deal) notification accurate and
configurable. Kurt reported that deals he had contacted (logged in-app) the
previous day still showed a "Deal needs attention" notification the next day.

Root cause: the stale-deal nudge, emitted by the daily cron sweep, was only ever
created, never cleared once contact happened, so an already-emitted nudge
lingered unread in the feed even after the deal was worked. Compounding it, the
staleness clock (`deal.lastContactAt`) was reset only by `logQuickActivity`, not
by other real engagement (completing a follow-up, sending a quote, advancing a
stage).

## Actions Taken

- New shared write core `src/lib/mutations/deal-contact.ts`:
  `touchDealContact(dealId, at?)` stamps `deal.lastContactAt` + `updatedAt`, then
  best-effort resolves outstanding stale nudges for the deal.
- New `resolveStaleNudges(dealId)` in `src/lib/notifications.ts`: sets `read_at`
  on unread `type='stale_deal'` notifications for a deal (matched via
  `payload->>'dealId'`), wrapped in try/catch so it never fails the triggering
  write.
- Routed contact-like actions through `touchDealContact`: `logQuickActivity`
  (replaced the inline stamp), `completeFollowUp` (`follow-up-actions.ts`),
  `sendQuote` (`quote-actions.ts`), and `moveDealToStage` for genuine transitions
  only (`deal-actions.ts`). Logging activity, completing a follow-up, sending a
  quote, or advancing a stage now all reset the clock and clear the nudge.
- Added admin levers on the stale nudge with no schema change (new `app_setting`
  keys, defaults preserving prior behaviour): `stale_nudge_enabled` (default
  true) and `stale_nudge_repeat_days` (default 0 = once per staleness episode).
  Added `getStaleNudgeConfig()` to `src/lib/alerts.ts`. `sweepStaleDealNudges`
  (`notification-sweeps.ts`) now bails when disabled, and appends a time-bucket
  to the dedupe key only when `repeat_days > 0`.
- Settings UI: extended `AlertThresholdsForm` (enable checkbox + "remind again
  every (days)" input), `alertThresholdsSchema` (`validation/settings.ts`),
  `updateAlertThresholds` (`settings-actions.ts`), and the settings page wiring.
  Clarified the `stale_deal` notification-type copy (`notification-types.ts`) and
  the Help page notifications section.

## Decisions Made

- **Reuse `lastContactAt` as the staleness clock rather than add a column.**
  `lastContactAt` doubles as the deal card's "last contact" label, so stamping it
  on a stage move makes that label read as the move date. Accepted as the
  pragmatic choice: it reuses the existing stale query and every reader with no
  migration. A dedicated `lastActivityAt` column was considered and deferred.
- **Clear via `read_at`, not deletion.** Resolving a nudge marks it read (matched
  on `payload->>'dealId'`), consistent with the no-prod-data-deletion rule and
  keeping the feed history intact.
- **Best-effort resolution.** `resolveStaleNudges` is wrapped in try/catch so a
  notification-clear failure can never break the underlying activity/quote/stage
  write.
- **Byte-identical default dedupe key.** With `repeat_days = 0` the dedupe key
  stays exactly the pre-cadence key (no time bucket appended), so enabling the
  default cadence never double-emits against existing rows.
- **Config defaults preserve prior behaviour.** `stale_nudge_enabled` defaults
  true and `stale_nudge_repeat_days` defaults 0, so the sweep behaves as before
  until an admin changes it.

## Issues Encountered

- Combined-partial-subset e2e runs showed shared-DB interference failures. These
  specs are designed to run across all three Playwright projects concurrently
  against the shared remote Neon staging DB; each spec passes clean on its own.
  Not a product regression.

## Verification

- `npm exec -- ultracite check`: clean.
- `npm run build`: success.
- e2e: `alerts.spec` (2/2) and `notifications.spec` (7/7, including a new test
  "logging contact clears an outstanding 'needs attention' nudge") pass in
  isolation on the desktop project.

## Prod Rollout

- Code-only: no schema change and no `db:push` required (reuses
  `notification.read_at` and the existing `app_setting` table).
- Deploy via local `npm run deploy` per the split-brain rule; verify against dev
  via `npm run preview` first, keep prod checks read-only.

## Next Steps

- Manual dev check: log activity / complete a follow-up / send a quote / advance
  a stage on a stale deal and confirm the "needs attention" nudge clears; toggle
  the enable + repeat-days levers in `/settings` and confirm sweep behaviour.
- Optional future: a dedicated `lastActivityAt` column to decouple the staleness
  clock from the "last contact" display label.

## Related Files

- New: `src/lib/mutations/deal-contact.ts`
- Modified: `src/lib/notifications.ts`, `src/lib/alerts.ts`,
  `src/lib/notification-sweeps.ts`, `src/lib/notification-types.ts`,
  `src/lib/actions/deal-actions.ts`, `src/lib/actions/follow-up-actions.ts`,
  `src/lib/actions/quote-actions.ts`, `src/lib/actions/settings-actions.ts`,
  `src/lib/validation/settings.ts`, `src/components/alert-thresholds-form.tsx`,
  `src/app/(app)/settings/page.tsx`, `src/app/(app)/help/page.tsx`,
  `e2e/notifications.spec.ts`
