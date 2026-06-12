# Work Log: M0 Auth — Team Sign-In (Andy, Kurt, Jess)

**Agent**: Claude Code
**Mode**: Implementation (resurrected the parked auth WIP and finished it)
**Date**: 2026-06-12

## Task Description

Ship sign-in so Andy, Jess, and Kurt can log in (PRD §4.2 / M0).
Email/password via Better Auth, with Microsoft 365 (Entra) SSO activating
automatically once the Entra app registration lands (the env vars are the
switch). Foundation was the parked `claude/auth-parked` WIP from 10 June.

## Actions Taken

- **Cherry-picked the parked commit** (`ce97b71`) onto current main and
  resolved it against everything since: sign-in page in the (public)
  group, `requireSession` gating on the (app) layout, sign-out in the
  shell (desktop sidebar + mobile header), attachment API gating, seed
  attaching credential accounts (`SEED_USER_PASSWORD`, local default
  `blu-crm-dev`), conditional Microsoft SSO config.
- **Conflict resolution kept the single-write-path architecture**: the
  parked branch predated `src/lib/mutations/`, so its inline
  `createdBy` attribution moved into the cores; `createFollowUpCore` and
  `createQuoteCore` take an optional `createdBy`, the form actions pass
  the session user, and the AI tools pass the confirming user
  (`ctx.userId`), so AI-driven writes are now attributed too.
- **Assistant routes tightened to 401**: `resolveAssistantUser` no longer
  falls back to the first seeded user; /api/chat and both thread routes
  require a session (the Phase 1 "tighten when auth ships" note).
- **Playwright signs in**: global-setup posts to
  `/api/auth/sign-in/email` as Kurt and saves storage state that all
  three projects reuse; the dev-server webServer entry gained a 240s
  timeout (cold Turbopack compiles on slow filesystems blow the 60s
  default).
- **`e2e/auth.spec.ts`** (runs signed-out): unauthenticated bounce to
  /sign-in, wrong-password error, sign-in/out round trip incl. the
  session really being gone, public surfaces (/enquire) staying
  reachable, axe WCAG A/AA scan of the sign-in page.
- **Settings > Account card**: shows who is signed in and a
  change-password form (`authClient.changePassword`,
  `revokeOtherSessions: true`) so the seeded initial password can be
  retired per person. Refreshed stale "arrives with sign-in" copy.
- **Docs**: "Signing in" section on /help; `SEED_USER_PASSWORD`
  documented in `.env.example`.

## Decisions Made

- **Email/password now, Entra SSO when registered**: the Entra app
  registration (PRD §4.3) is an external dependency; the sign-in page
  shows the Microsoft button automatically once
  MICROSOFT_CLIENT_ID/SECRET exist, so no code change is needed later.
- **Page gating sits on the (app) layout**, matching the parked design.
  Server actions rely on that surface gating plus attribution; hard
  session checks inside every action can come with role-based access.
- Change-password revokes other sessions so a shared starter password
  stops working everywhere the moment it is replaced.

## Verification

- `npm exec -- ultracite check` — clean (203 files).
- `tsc --noEmit` — clean.
- `npm run build` — passes.
- Auth specs 15/15 (5 specs x phone/tablet/desktop); assistant specs all
  green against the 401-tightened routes (signed-in storage state).
- Full Playwright suite: 245 passed, 3 intentional skips, 1 tablet
  gated-write flake that passes in isolation (shared-DB contention).

## Next Steps

- Production: seed with a strong `SEED_USER_PASSWORD`, set
  `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` in Wrangler, then have Andy,
  Jess, and Kurt change passwords under Settings > Account.
- Entra app registration → set the MICROSOFT_* vars to light up SSO.
- Role-based access (admin vs sales) on actions once roles matter.

## Related Files

- `src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/auth-client.ts`
- `src/app/(public)/sign-in/page.tsx`, `src/app/(app)/layout.tsx`
- `src/components/sign-in-form.tsx`, `src/components/sign-out-button.tsx`,
  `src/components/change-password-form.tsx`, `src/components/app-shell.tsx`
- `src/lib/ai/assistant-user.ts`, `src/lib/mutations/*`, `src/db/seed.ts`
- `e2e/auth.spec.ts`, `e2e/global-setup.ts`, `playwright.config.ts`
- `src/app/(app)/settings/page.tsx`, `src/app/(app)/help/page.tsx`
