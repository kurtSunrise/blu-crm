# Work Log: Notifications Overhaul (per-user feed, badge, preferences, routing, cron)

**Agent**: Claude Code (Fable 5)
**Session ID**: N/A
**Mode**: Implementation (plan approved via plan mode)
**Date**: 2026-07-03T00:00:00+08:00
**Duration**: ~1 session

## Task Description

Overhaul the M2-era notification system into a best-in-class in-app solution.
Agreed scope: in-app only (schema does not preclude future channels), unread
bell badge with ~45s polling, per-user event-type preferences, ownership plus
admin-configured routing, cron-driven sweeps. See plan file
`cozy-bouncing-pine` and PRD FR-11.1.

## Actions Taken

- **Schema** (`src/db/schema.ts`, pushed to dev): `notification.dedupe_key`
  (unique partial-free index; sweeps become `onConflictDoNothing` upserts),
  `notification_user_created_idx`, partial `notification_user_unread_idx`
  (`read_at is null`, serves the polled badge count), new
  `notification_preference` table (PK `(user_id, type)`, absence = enabled).
- **Type registry** `src/lib/notification-types.ts`: one entry per type
  (label, description, describe(), href()); six types including new
  `follow_up_due` and `stale_deal` (PRD-P0, previously unbuilt). Unknown
  legacy types fall back to a humanised title.
- **Emission layer** `src/lib/notifications.ts`: `emitNotification` /
  `emitNotificationBatch` (actor suppression, one preference-filter query,
  bulk dedup-keyed insert, try/catch so a notification never fails the
  triggering mutation), `getNotificationPreferenceMap`,
  `getHandoverRecipientIds` (appSetting `handover_recipient_ids`, fallback:
  all active admins). The hardcoded `kurt@blu.builders` recipient is gone.
- **Sweeps** `src/lib/notification-sweeps.ts`: overdue follow-ups (rewritten,
  dedupe keys replace the payload anti-join), due-today follow-ups (AWST day),
  stale-deal nudges (reuses `getStaleDeals` from alerts.ts, now selecting
  ownerId, so thresholds can never drift from the dashboard; dedupe key
  anchors on the staleness episode `coalesce(last_contact_at, created_at)`).
- **Call sites** routed through emit: inbox assign (`lead_assigned`, actor
  suppressed), deal-actions handover (admin routing, NO actor suppression:
  handover is a delivery work item even for the closer), public quote view
  (`quote_viewed`).
- **Cron**: `wrangler.jsonc` `triggers.crons` `*/20 * * * *` (overdue) and
  `0 23 * * *` (= 7:00 AWST, due-today + stale). `worker-entry.mjs` now
  exports `scheduled`, dispatching an in-memory `worker.fetch` POST to
  `/api/cron/notifications` with `Bearer ${env.CRON_SECRET}` (no network
  self-fetch: `global_fetch_strictly_public`). Route dispatches per cron
  expression, returns inserted counts; 503 unset / 401 mismatch.
- **Badge**: `GET /api/notifications/unread-count` (session-scoped, no-store)
  + `src/components/notification-bell.tsx` (45s visibility-aware polling,
  refetch on navigation and on the `blu:notifications-changed` CustomEvent);
  one hook instance in `AppShellInner` feeds both desktop sidebar and mobile
  header bells.
- **/notifications page**: per-user scoping (`requireSession`), Today /
  Yesterday / Earlier grouping (AWST), cursor pagination (`?before=`, 50/page),
  registry-driven rendering, `notification-item.tsx` client island (tap-through
  marks read fire-and-forget; separate 44px read/unread toggle). The lazy
  overdue sweep stays on page load as belt-and-braces beside the cron (both
  idempotent via dedupe keys).
- **Actions** rewritten: `markAllNotificationsRead` scoped to caller,
  `markNotificationRead/Unread` (zod + userId guard),
  `updateNotificationPreferences` (bulk upsert), `updateHandoverRecipients`
  (`requireAdmin`, id validation).
- **Settings**: new `/settings/notifications` tab: per-user type toggles for
  everyone; admin-only "Company event routing" recipients picker.
- **Backfill**: `scripts/backfill-notification-dedupe.ts` +
  `db:backfill-notification-dedupe[:prod]` stamps dedupe keys on existing
  `follow_up_overdue` rows so the new sweep cannot re-notify history.
- **Help page** notifications section rewritten for the new behaviour.
- **E2E**: new `e2e/notifications.spec.ts` (6 tests: scoping + scoped
  mark-all, tap-through + toggle, muted preference suppression/resume,
  preferences form persistence, admin handover routing, cron auth +
  idempotency). Harness: `notification_preference` in global-setup clear
  list; test-shaped notification rows added to `test-data-sweep.ts`.
  Existing specs updated for per-user scoping: intake + quotes now assert the
  recipient's row server-side (feed no longer global), follow-ups picks Kurt
  as follow-up owner explicitly.

## Decisions Made

- Free-text `type` + code-side registry over pg enum / stored title columns:
  legacy rows keep rendering, copy fixes apply retroactively, future channels
  render from the same registry.
- Dedupe key stored as `{type}:{subjectId}:{recipientId}` under a unique
  index: sweeps are safely concurrent (cron + page-load + manual overlap).
  Deliberate behaviour change: a reassigned overdue follow-up notifies the
  new owner once.
- Actor suppression applies to `lead_assigned` (self-assignment is silent)
  but NOT `handover_to_delivery` (it is a work item for delivery, and the
  closer is often the recipient).
- Recipient-side preference mute wins over admin routing (flip by skipping
  the filter for company-routed types if the team disagrees).
- Routing config in `appSetting` as a JSON id array, matching every other
  admin setting; stale/disabled ids dropped at read time.

## Issues Encountered

- A stale `.kilo/worktrees/rigorous-hallway` biome.jsonc broke `ultracite`
  repo-wide; excluded `.kilo/**` in `biome.jsonc`.
- Cross-project e2e races: phone/tablet/desktop run concurrently against the
  same seeded users, so shared switches (preference rows, mark-all-read)
  originally clobbered each other. Fixed by keying muted/prefs-form targets
  per project and writing shared-state assertions to converge (probe
  reinsertion for the badge, re-toggle loops, isVisible-guarded mark-all).
- Tablet project (WebKit) times out on `goto` waiting for `load` when several
  workers hit the dev server concurrently (page stuck at the loading
  skeleton; same class as the known dev/prod streaming stalls). All 6 new
  tests pass on tablet with `--workers=1`, and on phone/desktop in parallel.
  Environment flake, not a product bug.
- Pre-existing failures confirmed NOT from this work (fail on stashed main
  too): `settings.spec.ts` first two tests (heading "Settings" never
  existed on /settings), calendar-page axe colour-contrast violation
  (`text-muted-foreground/50` day bubbles), `reports-analytics.spec.ts` +
  `scripts/probe-lingering.ts` lint errors.

## Deployed to production (2026-07-03)

All rollout steps completed the same day:

1. Pre-flight: 37Gi free disk, wrangler on the Paid `0f665...` account.
2. `npm run db:push:prod` applied (dedupe_key column, 3 indexes,
   notification_preference table).
3. `npm run db:backfill-notification-dedupe:prod`: 192 follow_up_overdue rows
   stamped, 0 unstampable.
4. `CRON_SECRET` generated, stored in `.env.production` (uncommitted) and set
   via `wrangler secret put CRON_SECRET`.
5. `npm run deploy`: version `7e5a7b32-4da5-4bfa-aed9-710ec6eb8a2a`, both cron
   schedules registered (`*/20 * * * *`, `0 23 * * *`).
6. Live verification: cache-busted `/sign-in` 200 in ~1.0s; cron route 401 on
   wrong/missing token; authed POST returns `{"inserted": {...}}`; repeat runs
   return zeros (dedupe idempotency confirmed in prod). First stale-deal burst
   inserted 14 rows for owned stale deals; backfilled overdue history was NOT
   re-notified. One first-request-after-deploy curl rendered a 404 page
   (cold-start oddity); all subsequent requests behaved.

## Remaining Next Steps

1. Kurt: open Settings, Notifications on the live site and set handover
   recipients (defaults to all admins until set).
2. Announce behaviour changes: feed is per-user; mark-all-read is per-user;
   self-assignments no longer notify; a first burst of stale-deal nudges has
   already landed for deal owners.

## Related Files

New: `src/lib/notification-types.ts`, `src/lib/notification-sweeps.ts`,
`src/app/api/notifications/unread-count/route.ts`,
`src/app/api/cron/notifications/route.ts`,
`src/components/notification-bell.tsx`, `src/components/notification-item.tsx`,
`src/components/notification-preferences-form.tsx`,
`src/components/handover-recipients-form.tsx`,
`src/app/(app)/settings/notifications/page.tsx`,
`scripts/backfill-notification-dedupe.ts`, `e2e/notifications.spec.ts`

Modified: `src/db/schema.ts`, `src/lib/notifications.ts`,
`src/lib/actions/notification-actions.ts`, `src/lib/actions/inbox-actions.ts`,
`src/lib/actions/deal-actions.ts`, `src/lib/alerts.ts`,
`src/app/(public)/q/[token]/page.tsx`, `src/app/(app)/notifications/page.tsx`,
`src/app/(app)/help/page.tsx`, `src/components/app-shell.tsx`,
`src/components/settings-nav.tsx`, `worker-entry.mjs`, `wrangler.jsonc`,
`package.json`, `biome.jsonc`, `e2e/global-setup.ts`,
`e2e/test-data-sweep.ts`, `e2e/intake.spec.ts`, `e2e/quotes.spec.ts`,
`e2e/follow-ups.spec.ts`, `WorkLogs/TEAM_CONSTITUTION.md`
