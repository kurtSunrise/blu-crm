# Work Log: M2 Follow-up Safety: Tasks, Alerts, Notifications, Won/Lost

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: cse_01WsDKrW9UJW7aBbMFBca1nW
**Mode**: Implementation (autonomous)
**Date**: 2026-06-10T16:30:00+08:00
**Duration**: ~1.5 hours

## Task Description

Implement M2 (PRD §12.1, "Never drop a follow-up"): due-dated follow-ups with
a daily task list (FR-5.1/5.2), stale and closing-soon alerts with
admin-configurable thresholds (FR-5.3), in-app notifications (FR-11.1), and
Won/Lost handling with handover flag and required lost reason (FR-1.6).
Exit criteria: US-07, US-08, US-10 pass E2E. Continues the M1 work log.

## Actions Taken

- **Environment**: fresh container had no DB. Started the local Postgres 16
  cluster, created `blu_crm`, wrote `.env.local`, pushed schema, seeded.
- **Local DB driver fallback** (`src/db/index.ts`): a localhost `DATABASE_URL`
  now uses `drizzle-orm/node-postgres` (`pg`, devDependency) because Neon's
  HTTP driver only speaks to Neon's proxy. Conditional `require` keeps `pg`
  out of the Cloudflare bundle; prod path unchanged. Documented in
  `.env.example` and the constitution.
- **Schema**: added `app_setting` key/value table for the FR-5.3 AC
  (thresholds must be admin-configurable); `follow_up` and `notification`
  tables already existed from M0.
- **Validation** (`src/lib/validation/{follow-up,settings}.ts`, `deal.ts`):
  follow-up create/complete, alert thresholds, and `moveDealStageSchema`
  extended with `lostReason` + `handoverToDelivery`; `LOST_REASONS` enum.
- **Won/Lost** (`moveDealStage`): server rejects entering a Lost stage
  without a reason; entering Won stores the handover flag and inserts a
  `handover_to_delivery` notification routed to Kurt (kurt@blu.builders);
  stage-change activity records the reason/handover; lost reason cleared
  when a deal re-enters a non-lost stage. Shared `StageChangeDialog` (new
  Base UI `ui/dialog.tsx`) intercepts Won/Lost moves from the board menu,
  drag-and-drop, and the deal-page stage select.
- **Follow-ups**: `follow-up-actions.ts` (create via form action, complete),
  form + complete button components, follow-ups section on the deal page.
- **Tasks page** (`/tasks`): Overdue (distinct styling + badge, listed
  first per FR-5.2 AC), Today, Upcoming, bucketed by AWST day boundaries
  (`awstDayRange` in `format.ts`; Perth is fixed UTC+8); owner filter chips;
  plus "Needs attention" and "Closing soon" deal lists (FR-5.3).
- **Alerts** (`src/lib/alerts.ts`): threshold read with defaults (7/14
  days), stale = `coalesce(last_contact_at, created_at)` older than
  threshold, closing soon = fixed date or expected close inside the window;
  both exclude Won/Lost and soft-deleted deals.
- **Notifications** (`/notifications`): list with unread highlighting and
  "Mark all read"; lazy idempotent sweep creates `follow_up_overdue`
  notifications on page load (no scheduler on Workers in V1); bell + settings
  icons in the header; Tasks added to the bottom nav.
- **Settings page** (`/settings`): stale/closing-soon day thresholds,
  upserted into `app_setting`.
- **Home dashboard**: now dynamic; open-pipeline value/count excluding
  Won/Lost (FR-1.6 AC), and four stat tiles (overdue, due today, needs
  attention, closing soon) linking to /tasks; Tasks module card is Live.
- **E2E** (`e2e/{follow-ups,won-lost,alerts}.spec.ts`): US-07 deal + daily
  list + complete; overdue notification; US-10 Won dialog/handover/
  notification, Lost requires reason + reason recorded, cancel path; US-08
  closing soon via fixed date and stale via threshold set to 0 on /settings
  (also proves configurability). 42/42 pass across phone/tablet/desktop.
- **Fixed pre-existing webkit failure** (contacts duplicate test): Playwright
  fills the controlled Name input before hydration on the emulated tablet, so
  React state stayed empty and a later re-render wiped the field. Contact
  form is now uncontrolled; the action echoes submitted values back in state
  so the post-action form reset restores them (React 19 canonical pattern).
- Refactored `createQuickAddDeal`'s lead-ID retry loop into a helper to clear
  Biome's cognitive-complexity ceiling.

## Decisions Made

- **Lost reason is enforced server-side**, not just in the dialog, so the
  future AI tool path inherits the FR-1.6 AC for free.
- **Handover notification recipient is looked up by email** rather than the
  seeded id, so it keeps working once Better Auth creates real user rows.
- **Overdue notifications are swept lazily** on /notifications load; without
  transactions the idempotency check (payload `followUpId`) is best-effort
  under concurrency. Revisit with Cloudflare cron triggers later.
- **Notifications/tasks show all users' items** (with owner labels/filters)
  because sessions are still unwired; per-user scoping lands with auth.
- "Today" buckets use AWST day boundaries, matching the house locale rules.
- Closing soon includes `expected_close_date` as the "decision within 14
  days" signal alongside `fixed_date` (US-08 wording).

## Issues Encountered

- Fresh container: Postgres cluster existed but was down; no `.env.local`;
  Playwright browsers needed install (`webkit` needed `install-deps`).
- Strict-mode locator collisions in the new specs (deal title appears in
  both the card title and the company subtitle; "Mark as Won" heading vs
  "Mark as won" button) fixed with `exact`/role-scoped locators.
- The webkit hydration race above was the only baseline failure and is fixed
  app-side, not by loosening the test.

## Next Steps

- M3: web enquiry form, email-to-lead, Leads inbox, CSV import, quotes +
  viewed alert, documents/photos on R2.
- Auth: sign-in screens, route gating, attach credentials/M365 SSO to the
  seeded users; then scope tasks/notifications per user and populate
  `created_by` from the session.
- Prod schema push needed before deploy: `npm run db:push:prod` must add
  `app_setting` (no Neon credentials in this container).
- Unread-count badge on the header bell (needs a lightweight data path).
- CI pipeline (M0 leftover).

## Related Files

- src/db/{schema.ts,index.ts}, src/lib/{alerts,notifications,labels,format}.ts
- src/lib/validation/{deal,follow-up,settings}.ts
- src/lib/actions/{deal,contact,follow-up,notification,settings}-actions.ts
- src/components/{stage-change-dialog,stage-select,pipeline-board,follow-up-form,complete-follow-up-button,alert-thresholds-form,contact-form,app-shell}.tsx
- src/components/ui/dialog.tsx
- src/app/{tasks,notifications,settings}/page.tsx, src/app/page.tsx,
  src/app/deals/[id]/page.tsx, src/app/pipeline/page.tsx
- e2e/{follow-ups,won-lost,alerts}.spec.ts
