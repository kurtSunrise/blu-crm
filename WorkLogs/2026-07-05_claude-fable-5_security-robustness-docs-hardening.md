# Work Log: Security, Robustness, and Documentation Hardening

**Agent**: Claude Fable 5 (claude-fable-5)
**Session ID**: e5df4c83-3a1a-43cc-b5d8-1aa4934251bd
**Mode**: hardening + documentation
**Date**: 2026-07-05 (work spanned 2026-07-04/05)

## Task Description

"Check over code and harden as needed for a best in class product; update site documentation so future AI knows about the aspects of the build." Full audit of the codebase (3 explore agents), then hardening executed per the approved plan.

Continues from and commits the streams logged in:
- `2026-07-02_claude-fable-5_reports-best-in-class-phase1-2.md`
- `2026-07-03_claude-fable-5_header-navigation-unification.md`
- `2026-07-04_claude-fable-5_contacts-best-in-class-phase1.md`

## Actions Taken

### 1. Housekeeping commits
- Committed the three finished in-flight streams separately: feat(nav) `345f7f2`, feat(reports) `9b0ae68`, feat(contacts) `8ce8c08`, plus docs(constitution) `ec7610a`.
- Contacts phase 1 remains intentionally undeployed.

### 2. Security
- Added typed helpers `requireActionSession` / `requireActionAdmin` in `src/lib/session.ts`, and a `runAction` infra-error wrapper (with `unstable_rethrow`) in `src/lib/actions/run-action.ts`.
- Gated ALL previously ungated server actions: company, contact, deal, quote, follow-up, inbox, and import actions now require a session; `manageStages` in stage-actions and all six settings-actions now require admin.
- Wrapped the already-gated notification, sub-status, and team actions in `runAction`; team-actions got a `runTeamAction` adapter to preserve its `{ ok }` contract.
- Added "Admins only" notice guards to `settings/page.tsx` and `settings/ai/page.tsx`, mirroring `settings/statuses`.
- Chat attachment GET is now scoped to `uploadedBy`; legacy null-uploadedBy rows 404 (they were transient composer thumbnails).
- Added nosniff + CSP sandbox headers on both attachment streaming routes.
- Added six global security headers in `next.config.ts`: nosniff, X-Frame-Options DENY, CSP frame-ancestors none, Referrer-Policy, HSTS, Permissions-Policy. A script-src CSP was deferred (needs nonce plumbing).
- Enabled Better Auth sign-in rate limiting with database storage: new `rate_limit` table in the schema, 10/min/IP on `/sign-in/email`. Better Auth's own "enabled in production" default never fires on workerd (verified empirically against the preview), so the switch is the explicit `AUTH_RATE_LIMIT_ENABLED` var in `wrangler.jsonc` vars: on for the deployed Worker and `npm run preview`, off for `next dev` and Playwright (which do not read wrangler vars).
- Added `public/_headers` so the Workers static-assets layer (which serves files without invoking the worker) also sends `X-Content-Type-Options: nosniff`.
- Added a per-user daily chat cap on `/api/chat`: `CHAT_DAILY_MESSAGE_LIMIT`, default 200, returns 429, checked before thread creation.
- Seed script now fails hard when `SEED_USER_PASSWORD` is unset on non-local databases.
- Restricted `sharedFolderUrl` schema to http(s); added a comment on the cron bearer compare.

### 3. Robustness
- Six new boundary files: `src/app/(app)/error.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx` (with its own html/body), root + `(app)` `not-found.tsx`, and `q/[token]/not-found.tsx` that does not leak token validity.
- Rewrote dashboard `page.tsx` and `getWeeklyReport` to two-wave `Promise.all` (each had 8 serial Neon round trips, the known workerd 503 pattern).
- Added `REPORT_DEALS_LIMIT` / `REPORT_ACTIONS_LIMIT` caps on the three unbounded weekly-report queries.
- `logQuickActivity` now revalidates `/pipeline`, `/contacts`, and `/`.
- Added an atomicity-ordering comment on `deleteStage`.
- Extracted the bodies of four actions (`createQuickAddDeal`, `moveDealStage`, `setDealSubStatus`, `updateContact`) to top-level helpers because the `runAction` nesting pushed cognitive complexity over the Biome cap.

### 4. Documentation
- Fully rewrote `CLAUDE.md` (it was the stale "Blu Shed Workshop Inventory Portal" doc). It now covers the corrected stack, full script catalogue, route/module map, data-layer and action rules, deployment split-brain, watchdog, cron, an env var table, testing, evals, and the knowledge corpus.
- Converted `AGENT.md` to a pointer at `CLAUDE.md`.
- Updated `WorkLogs/TEAM_CONSTITUTION.md`: Blu CRM name, route gating documented as layered + rate limited, AI chat marked shipped (M4), AGENTS.md reference fixed to AGENT.md, new Hardening Conventions section, and env vars `EMAIL_INTAKE_TOKEN` / `SEED_USER_PASSWORD` / `CHAT_DAILY_MESSAGE_LIMIT` documented.

## Decisions Made

- **Admin role required for stage management and org-wide settings.** The user was asked and defaulted to the recommended option. E2E is unaffected because the suite user (kurt) is admin; Jess sees "Admins only" notices.
- **Deal attachments stay org-visible** by design (shared team workflow).
- **Contacts directory stays unbounded** for now; revisit at roughly 2,000 contacts.
- **No transactions strategy** on the Neon HTTP driver: accept and document write ordering so any prefix leaves recoverable state, rather than introducing a transaction layer.
- Script-src CSP deferred rather than shipped weak: a meaningful policy needs nonce plumbing through the App Router.

## Issues Encountered

- `runAction` nesting pushed four action functions over the Biome cognitive-complexity cap; resolved by extracting their bodies to top-level helpers.
- Legacy chat attachment rows with null `uploadedBy` cannot be scoped to an owner; they now 404. Verified they were only transient composer thumbnails, so no data loss.

### Verification
- `npm exec -- ultracite check`: exit 0.
- `npm run build`: passes.
- Targeted Playwright subset (smoke, auth, pipeline, quotes, settings, stage-management, sub-status, contacts, companies, csv-import, intake, attachments, follow-ups, won-lost, deal-note, ai-assistant on phone + desktop projects): 92 passed, 1 skipped, 0 failed.
- Dev DB schema push applied (`rate_limit` table).
- Preview (`npm run preview`) verified end to end: all six global headers present on dynamic routes; `X-Content-Type-Options: nosniff` on static assets via `public/_headers`; unauthenticated attachment fetch and chat POST return 401; unknown routes 404; and 12 rapid bad sign-ins with a client IP header returned 10 x 401 then 429 with the counter row keyed `ip|/sign-in/email` in `rate_limit`. Local curl without a forwarded IP is not limited (no key); Cloudflare always supplies the client IP in production.

## Next Steps

- **Prod rollout order matters**: run `npm run db:push:prod` BEFORE `npm run deploy`. The `rate_limit` table must exist first; database-storage rate limiting would break prod auth without it.
- Deploy is user-initiated only and will carry contacts phase 1 along when it happens.
- Post-deploy check: 11 rapid bad sign-ins should give a 429.
- Future work: nonce-based script-src CSP; possible CTE fusion of `deleteStage`.

## Related Files

- `src/lib/session.ts` (new action-gating helpers)
- `src/lib/actions/run-action.ts` (new) and all 12 action modules under `src/lib/actions/`
- `next.config.ts` (global security headers)
- `src/db/schema.ts` (`rate_limit` table), `src/db/seed.ts`
- `src/lib/auth.ts` (rate limiting)
- `src/app/api/chat/route.ts` (daily message cap)
- API attachment streaming routes (headers, uploadedBy scoping)
- New boundary files: `src/app/(app)/error.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/app/(app)/not-found.tsx`, `src/app/q/[token]/not-found.tsx`
- `src/app/(app)/page.tsx`, `src/lib/reports.ts` (query parallelization + limits)
- `src/lib/validation/deal.ts` (`sharedFolderUrl` http(s) restriction)
- `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/ai/page.tsx` (admin notices)
- `CLAUDE.md`, `AGENT.md`, `WorkLogs/TEAM_CONSTITUTION.md`
