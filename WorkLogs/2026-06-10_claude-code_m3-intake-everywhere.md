# Work Log: M3 Intake Everywhere: Web Form, Email-to-Lead, Inbox, Quotes

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: cse_01WsDKrW9UJW7aBbMFBca1nW
**Mode**: Implementation (autonomous)
**Date**: 2026-06-10T19:00:00+08:00
**Duration**: ~1.5 hours

## Task Description

Implement the core of M3 (PRD §12.1, "Intake everywhere"): public web
enquiry form (FR-3.2), email-to-lead raw intake (FR-3.3), Leads inbox with
triage (FR-3.5), and lightweight quotes with the tokenised viewed alert
(FR-6.1/6.2). Exit-criteria stories US-01, US-03, US-09 covered by E2E.
Continues the M2 work log; based on main at 52314d9 (post merge fix).

## Actions Taken

- **Route groups**: moved all CRM pages into `src/app/(app)/` (AppShell now
  lives in that group's layout) and added `src/app/(public)/` with minimal
  chrome for the two unauthenticated surfaces: `/enquire` and `/q/[token]`.
  URLs of existing pages are unchanged.
- **Shared intake path** (`src/lib/intake.ts`): `createLead` plus the
  find-or-create company/contact and lead-ID-retry helpers moved out of
  `deal-actions.ts`; quick-add, the web form, and email intake all write
  through it (PRD §10). `labels.ts` now owns PROJECT_TYPE/LEAD_SOURCE labels.
- **Public web enquiry** (US-03): `/enquire` page + `POST /api/enquiries`,
  write-only (only POST is exported), zod-validated, source-tagged `web`,
  honeypot field (silent success, nothing stored), and a per-IP in-memory
  rate limit (default 5/min, `ENQUIRY_RATE_LIMIT` override). Posts as JSON
  fetch rather than a server action so it works embedded cross-origin.
- **Email-to-lead** (US-01, raw path): `POST /api/intake/email` guarded by
  `EMAIL_INTAKE_TOKEN` bearer auth; every payload becomes a raw lead with
  the email body attached as a timeline note, so no enquiry is dropped
  (FR-3.3 AC). AI parsing into the intake template lands with M4.
- **Leads inbox** (FR-3.5): `/inbox` lists unassigned, undeleted deals from
  all channels with source badges; triage = assign owner (records an
  activity + `lead_assigned` notification) or discard (soft delete). Added
  to bottom nav and home modules.
- **Quotes** (FR-6.1/6.2, US-09): quotes section on the deal page (add at a
  value, Draft → Sent → Viewed → Accepted/Declined); marking sent issues a
  `viewToken` and client link `/q/[token]`; the public page exposes only the
  quote, flips Sent → Viewed on first open, logs a timeline quote event, and
  notifies the deal owner (`quote_viewed`); accepting rolls the value into
  `deal.quoted_value_cents` so it wins in stage totals (FR-1.4 AC).
- **CSV import** (FR-3.4): `/settings/import` (linked from Settings) for
  contacts and open deals. Hand-rolled RFC 4180 parser (`src/lib/csv.ts`,
  no new dependency), client-side column mapping with header auto-guess,
  preview with row count, per-row duplicate flags from the shared FR-2.3
  matcher (`src/lib/duplicates.ts`, now also used by the contact form),
  skip-or-import-anyway for flagged duplicates, deals placed into stages by
  name and owners resolved by email; deal rows go through `createLead`
  (which gained an optional `stageId`).
- **E2E** (`e2e/intake.spec.ts`, `e2e/quotes.spec.ts`,
  `e2e/csv-import.spec.ts`): web enquiry to inbox
  to assignment + notification; honeypot stores nothing; GET on the public
  endpoint is 405; forwarded email becomes a raw lead with body on the
  timeline; discard removes from inbox and pipeline; sent quote viewed via
  token alerts the owner; accepted quote value reaches the deal header.
- **E2E determinism**: `e2e/global-setup.ts` wipes CRM tables (never users/
  stages) before each run, and refuses to run against non-localhost
  databases. This fixed a load flake in the M2 follow-ups spec caused by
  unbounded data growth across runs.
- 63/63 Playwright tests pass (phone/tablet/desktop); ultracite, tsc, and
  `next build` clean. `.env.example` documents the two new variables.

## Decisions Made

- **Email intake is a token-guarded HTTP hop**, not a mailbox integration:
  it suits both a Cloudflare Email Worker and a Power Automate flow from
  info@blu.builders, and keeps PRD open question Q1 (forwarding vs Graph)
  open without blocking the inbox.
- **Email leads use source `other`** because the LeadSource enum (PRD §7)
  has no email value and the channel does not imply the marketing source;
  the M4 parser can set it properly.
- **Inbox membership = unassigned** (`owner_id is null`), so manual
  quick-adds with an owner skip the inbox while channel intakes land in it.
- **Rate limiting is per-isolate in-memory**, best effort alongside the
  honeypot; durable limiting can move to Cloudflare rate limiting rules if
  abuse shows up (risk R6 accepts this for V1).
- **Deferred from M3**: R2 documents/photos only (needs real bucket
  credentials; the upload pipeline is a Blu Shed pattern reuse). CSV
  import was initially deferred but landed in this same session.

## Issues Encountered

- Stale `.next` types broke `tsc` after the route-group move; fixed by a
  clean build.
- The honeypot E2E tripped the enquiry rate limiter (three browser projects
  share one IP locally); made the limit env-configurable instead of
  weakening the default.
- Playwright global setup runs as ESM in this setup: `__dirname` and named
  CJS imports from `pg` both fail; used `process.cwd()` and the default
  import.

## Next Steps

- M3 remainder: documents/photos on R2 (FR-9) once bucket credentials are
  in the environment; point a Cloudflare Email Worker or M365 forwarding
  rule at `/api/intake/email` and embed `/enquire` on blu.builders.
- Prod: `npm run db:push:prod` (app_setting from M2 still pending too) and
  set `EMAIL_INTAKE_TOKEN` as a Wrangler secret before enabling intake.
- M4: AI assistant (artifact chat, tool layer over the shared validation
  path, lead parsing to the intake template, confirmation gating).
- Auth remains the standing prerequisite for per-user scoping.

## Related Files

- src/lib/intake.ts, src/lib/labels.ts, src/lib/validation/{intake,quote}.ts
- src/app/api/{enquiries,intake/email}/route.ts
- src/app/(public)/{layout.tsx,enquire/page.tsx,q/[token]/page.tsx}
- src/app/(app)/{layout.tsx,inbox/page.tsx,page.tsx,deals/[id]/page.tsx}
- src/components/{enquiry-form,inbox-triage,quote-form,quote-row-actions,app-shell}.tsx
- src/lib/actions/{deal,inbox,quote}-actions.ts
- e2e/{intake,quotes}.spec.ts, e2e/global-setup.ts, playwright.config.ts
- .env.example, src/app/layout.tsx
