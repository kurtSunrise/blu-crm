# Work Log: M1 Pipeline Core — Kanban, Quick-Add, Contacts, Timeline

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: N/A
**Mode**: Implementation (autonomous)
**Date**: 2026-06-10T14:30:00+08:00
**Duration**: ~45 minutes

## Task Description

Implement M1 (PRD §12.1): kanban pipeline with the eight stages and per-stage
value totals, deal record with timeline, mobile quick-add, and
contacts/companies with duplicate detection. Sign-in screens explicitly
deferred by the user; auth route gating remains unwired.

## Actions Taken

- **Shared validation layer** (`src/lib/validation/*.ts`, zod): quick-add,
  stage-move, activity-log, and contact schemas — the single write path human
  forms and future AI tools share (PRD §10).
- **Server actions** (`src/lib/actions/*.ts`): `createQuickAddDeal`
  (find-or-create company/contact, lead-ID with retry), `moveDealStage`
  (records a `stage_change` activity), `logQuickActivity` (sets
  `last_contact_at`), `createContact` (FR-2.3 duplicate flow: exact
  email/phone always warns, fuzzy name warns, `allowDuplicate` proceeds).
- **Lead IDs** (`src/lib/lead-id.ts`): `BLU-[YYYY]-[###]` sequential per
  year; collisions retried up to 3 attempts.
- **Formatters** (`src/lib/format.ts`): AUD from integer cents, DD/MM/YYYY
  and date-time in AWST via Intl.
- **Pipeline board** (`/pipeline`): horizontal snap-scrolling columns,
  per-stage count + AUD total, dnd-kit drag with touch sensors **plus** a
  per-card "move to stage" dropdown (no-drag path, §9.2), optimistic updates.
- **Quick-add** (`/deals/new`): large-target form; only client/brand and one
  contact method mandatory (FR-3.1); owner select seeded with Andy/Kurt/Jess.
- **Deal detail** (`/deals/[id]`): record facts, stage select, two-tap quick
  log (call/site visit/email/meeting), unified timeline (FR-4.2).
- **Contacts** (`/contacts`, `/contacts/new`, `/contacts/[id]`): people +
  companies lists, duplicate warning with candidate links and "Create
  anyway", contact rollup of deals (with stage, one tap to open) and history.
- **App shell**: sticky header + bottom tab nav (Pipeline / Quick add /
  Contacts), 44px+ targets; home page modules now link to live routes.
- **Seed**: `db:seed` now also creates the three team users (auth
  credentials to be attached later).
- **E2E** (`e2e/pipeline.spec.ts`, `e2e/contacts.spec.ts`): eight stages
  render; quick-add lands on board (US-02); menu stage change updates column
  + totals (US-05, no-drag path); quick log appears in timeline; duplicate
  warning + create-anyway (US-04); contact rollup shows deal + stage (US-17).

## Decisions Made

- **Menu-based stage change is the E2E-tested path**; drag exists but isn't
  E2E-asserted (drag simulation is flaky cross-device; §9.2 requires the
  no-drag path anyway).
- **Won/Lost special handling deferred to M2** per the PRD milestone split —
  deals can be moved into Won / Lost-Dormant freely for now; reason capture
  and the handover flag come with M2.
- **`created_by`/`updated_by` populated from the selected owner** in
  quick-add and null elsewhere until sessions exist — a known, deliberate gap
  while auth is deferred.
- **No DB transactions**: the neon-http driver doesn't support them;
  company→contact→deal creation is sequential. Revisit with batch/tx when it
  matters.
- Quoted value wins over estimate in all value roll-ups (FR-1.4 AC).

## Issues Encountered

- React 19 resets uncontrolled form fields after a server action — the
  duplicate-warning round trip wiped the contact form, so "Create anyway"
  submitted empty. Fixed by making the contact form controlled.
- Base UI `DropdownMenuLabel` (Menu.GroupLabel) throws outside a Menu.Group —
  removed the label from the move menu.
- Drizzle wraps Postgres errors, so unique-violation detection had to walk
  `error.cause`; parallel E2E projects exposed a real lead-ID race.
- Playwright strict-mode collisions after adding the bottom nav (duplicate
  "Pipeline"/"Contacts" text) — locators scoped to roles/sections.

## Next Steps

- M2: follow-ups + daily task list, stale/closing-soon alerts, in-app
  notifications, Won/Lost reason + handover-to-delivery flag.
- Auth: sign-in screens, route gating, attach Better Auth credentials/SSO to
  the seeded users; then populate `created_by` from the session.
- Deal editing (value, venue, fixed date, owner) beyond stage changes.
- Company detail page (list exists; detail deferred).
- CI pipeline (M0 leftover).

## Related Files

- src/lib/{format,lead-id}.ts, src/lib/validation/*, src/lib/actions/*
- src/app/pipeline/page.tsx, src/app/deals/new/page.tsx,
  src/app/deals/[id]/page.tsx, src/app/contacts/**
- src/components/{app-shell,pipeline-board,deal-card,quick-add-form,stage-select,quick-log-buttons,contact-form}.tsx
- src/db/seed.ts, src/app/page.tsx, src/app/layout.tsx
- e2e/{smoke,pipeline,contacts}.spec.ts
