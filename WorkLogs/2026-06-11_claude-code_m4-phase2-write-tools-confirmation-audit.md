# Work Log: M4 Phase 2 — Gated Write Tools, Confirmation Round-Trip, Audit

**Agent**: Claude Code
**Mode**: Implementation (continuation of the approved M4 assistant plan)
**Date**: 2026-06-11

## Task Description

Complete and verify M4 Phase 2 (PRD §6 FR-7.8): AI write tools behind a
user confirmation round-trip with a full `ai_audit_log` lifecycle and
`data_changed` → `router.refresh()`. The implementation largely landed with
the `assistant` commit on main (mutation cores under `src/lib/mutations/`,
write tools, `confirmation-card.tsx`, audit lifecycle, pending-tool-use
thread state); this session restored a working local dev environment,
fixed the blockers, added the missing E2E coverage, and verified the lot.

## Actions Taken

- **Fixed local dev being broken on every DB page**: the lazy db client's
  computed `require("drizzle-orm/node-postgres")` (kept dynamic so esbuild
  cannot fold it into the Workers bundle, where `pg-cloudflare` fails to
  resolve) is rejected by Turbopack's require shim ("Cannot find module as
  expression is too dynamic"). `src/db/index.ts` now resolves the dynamic
  specifier through `node:module`'s `createRequire`, which both bundlers
  leave untouched. All 9 Phase 1 assistant specs went red → green on this
  one change.
- **E2E confirmation coverage** (`e2e/ai-assistant.spec.ts`): two new specs
  drive the full gated-write flow against the mock Anthropic server's
  existing `capture` → `create_lead` script: confirm path (card appears,
  audit row `proposed`, Confirm → `executed`, lead visible in /inbox) and
  cancel path (Cancel → `denied`, status line "Cancelled, nothing was
  changed", no lead in /inbox). Unique `UNIQ-<digits>` company tokens keep
  the three parallel Playwright projects from colliding on the shared DB.
- **`e2e/test-db.ts`**: shared `readDatabaseUrl` + `queryRows` helper so
  specs can assert server-side state (the audit lifecycle has no UI yet);
  global-setup now imports it instead of duplicating the env parsing.
- **`e2e/global-setup.ts`**: wipes `ai_audit_log`, `chat_message`,
  `chat_thread` ahead of the CRM tables. This also fixes a latent FK
  failure: `chat_thread.deal_id` references `deal`, so any thread opened
  from a deal page would have blocked the `deal` wipe.
- **Pipeline board a11y fix** (`src/components/pipeline-board.tsx`): the
  horizontal stage scroller failed axe `scrollable-region-focusable` on
  phone whenever the board held no focusable deal cards (exactly the
  post-wipe E2E state). The scroller is now a labelled, focusable region.

## Decisions Made

- Kept the module specifier assembled at runtime (`join("/")`) AND routed
  it through `createRequire`: the first keeps esbuild from bundling `pg`
  into the Worker, the second bypasses Turbopack's static-only shim. The
  branch only ever runs for localhost DATABASE_URLs, never on workerd.
- Audit assertions go straight to Postgres from the spec (token-filtered),
  not through any UI, since the audit log has no surface yet (Phase 5+).

## Issues Encountered

- `getByText("Inbox")` strict-mode violation (nav link + tab + heading);
  switched to the level-1 heading role.
- One flaky follow-up notification spec on tablet during the full run;
  passes in isolation, untouched by this work.

## Verification

- `npm exec -- ultracite check` — clean (190 files).
- `tsc --noEmit` — clean.
- `npm run build` — passes.
- Full Playwright suite — 219 passed, 3 skipped (pre-existing intentional
  skips), 0 failed across phone/tablet/desktop, including the 5 assistant
  specs per project (15 total).

## Next Steps

- Phase 3: artifact two-way sync (editable confirmation inputs ride the
  existing `finalInput` path; editable draft artifacts).
- Phase 4: persisted thread list + resume UX.
- Phase 5: P1 extras (lead scoring), eval set, docs.
- `npm run preview` NDJSON check on workerd before first assistant deploy;
  create the `blu-crm-cache` R2 bucket.

## Related Files

- `src/db/index.ts`, `src/components/pipeline-board.tsx`
- `e2e/ai-assistant.spec.ts`, `e2e/global-setup.ts`, `e2e/test-db.ts`
