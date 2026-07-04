# Blu Team Constitution

This document is the shared working agreement for contributors and AI agents in the Blu CRM repository. It should describe the project as it exists in the codebase today, not an aspirational stack from an earlier draft.

---

## Project Status

- **Product**: Blu CRM, a mobile-first CRM portal
- **Framework style**: Next.js App Router
- **Current backend direction**: Neon PostgreSQL with Drizzle ORM
- **Current auth direction**: Better Auth with a Drizzle adapter. Route gating is layered: the `(app)` layout requires a session for every in-shell page, and every server action gates itself with `requireActionSession`/`requireActionAdmin` (`src/lib/session.ts`) because actions are POST-addressable endpoints the layout gate does not cover. Sign-in is rate limited on the Worker (Better Auth `rateLimit`, database storage, `rate_limit` table, switched on by the `AUTH_RATE_LIMIT_ENABLED` var in `wrangler.jsonc` because the NODE_ENV default never fires on workerd)
- **Current UI direction**: touch-friendly, mobile-first, shadcn/ui-based interfaces
- **AI chat**: shipped (M4). Agent loop and tools live in `src/lib/ai/`, the endpoint is `/api/chat` (per-user daily message cap, default 200), threads are user-scoped, and the eval harness in `evals/` runs via `npm run ai:eval` with an 80% pass gate
- **Deployment**: Cloudflare Workers (worker name `blu-crm`) via `@opennextjs/cloudflare` + `wrangler`;
- **Scheduled work**: Cloudflare cron triggers (`wrangler.jsonc` `triggers.crons`) drive the notification sweeps. The OpenNext worker only exports `fetch`, so `worker-entry.mjs` exports `scheduled` and dispatches an in-memory authenticated request to `/api/cron/notifications` (never a network self-fetch: `global_fetch_strictly_public` is enabled).
- **Photo storage**: Cloudflare R2 bucket `blu-crm-photos` bound as `PHOTO_BUCKET`; objects stay private and stream through `/api/attachments/[id]`. Local dev uses the simulated binding from `initOpenNextCloudflareForDev()` (persisted under `.wrangler/`)

---

## Technology Stack

### Core Technologies
- **Framework**: Next.js 16.2.6
- **Frontend**: React 19.2.4
- **Language**: TypeScript 5
- **Database**: Neon PostgreSQL via `@neondatabase/serverless`
- **ORM / Schema**: Drizzle ORM 0.45.2 with Drizzle Kit 0.31.10
- **Auth**: Better Auth 1.5.6 with Drizzle adapter
- **Styling**: Tailwind CSS 4
- **UI Components**: shadcn/ui with Base UI primitives where needed
- **State Management**: React state and App Router data flow; no dedicated global state library is part of the current stack
- **Vision / AI SDK**: `@anthropic-ai/sdk` for the photo-search vision provider; Z.AI is also wired as an alternate provider

### Testing & Quality
- **E2E Testing**: Playwright 1.59.1
- **Unit Testing**: not currently configured
- **Linting / Formatting**: Biome 2.4.9 via Ultracite
- **Type Checking**: Next.js production build and TypeScript checks

### Deployment Stack
- **Hosting**: Cloudflare Workers
- **Adapter**: `@opennextjs/cloudflare` 1.19.x (build = `npx opennextjs-cloudflare build`, deploy = `npx wrangler deploy` which auto-delegates to `opennextjs-cloudflare deploy`)
- **CLI**: `wrangler` 4.x (devDependency)
- **Config files**: `wrangler.jsonc` (worker name `blu-crm`) and `open-next.config.ts`
- **Photo storage**: Cloudflare R2 binding `PHOTO_BUCKET` → bucket `blu-crm-photos`; private objects served via the app's attachment route, no public bucket URL

### Development Tools
- **Package Manager**: npm
- **Version Control**: Git
- **Code Quality**: Ultracite

---

## Development Standards

### Code Quality Principles

1. **Type Safety First**
   - Use explicit types where they improve clarity.
   - Prefer `unknown` over `any` when a value is genuinely unknown.
   - Prefer narrowing over assertions.
   - Use descriptive names instead of magic values.

2. **Modern TypeScript and JavaScript**
   - Use `const` by default.
   - Prefer `for...of` over `.forEach()` when iteration logic is non-trivial.
   - Use optional chaining and nullish coalescing where appropriate.
   - Prefer template literals to string concatenation.
   - Keep functions focused and reduce nesting with early returns.

3. **React and App Router**
   - Use function components.
   - Keep hooks at the top level.
   - Respect App Router conventions for `page.tsx`, `layout.tsx`, and `route.ts`.
   - Prefer server-rendered routes by default and add `"use client"` only when interactivity requires it.
   - Do not define components inside other components unless there is a strong reason.

4. **Accessibility**
   - Use semantic HTML first.
   - Keep heading hierarchy meaningful.
   - Add labels for inputs.
   - Ensure keyboard access for interactive controls.
   - Preserve large touch targets for phone and tablet use on the workshop floor.

### Error Handling
- Throw `Error` objects with descriptive messages.
- Use `try/catch` only where errors are handled meaningfully.
- Prefer early returns for invalid states.
- Remove `console.log`, `debugger`, and `alert` from production code.

### Security
- Add `rel="noopener noreferrer"` to external links opened in a new tab.
- Avoid `dangerouslySetInnerHTML` unless there is a documented reason.
- Do not use `eval()` or write directly to `document.cookie`.
- Validate and sanitize user input before persistence.

### Performance
- Avoid unnecessary client-side state and effects.
- Avoid spread-heavy accumulator patterns in loops.
- Prefer specific imports over namespace imports.
- Avoid barrel files unless there is a clear module-boundary benefit.
- Use Next.js image optimization patterns when actual image rendering is introduced.

---

## Code Organization

### File Naming Conventions
- **App Router files**: use Next.js conventions such as `page.tsx`, `layout.tsx`, and `route.ts`.
- **Shared components**: use the repository’s current kebab-case pattern, for example `app-shell.tsx` and `stock-badge.tsx`.
- **Utilities and helpers**: use kebab-case or established local conventions, for example `auth-client.ts` and `dummy-data.ts`.
- **E2E tests**: use `.spec.ts`.
- **Do not introduce a second naming convention into an existing folder without a strong reason.**

### Directory Guidance
- `src/app/`: routes, layouts, and route handlers
- `src/components/`: reusable UI and app-shell components
- `src/components/ui/`: shadcn/ui and primitive wrappers
- `src/lib/`: auth clients, shared helpers, and temporary dummy data
- `src/db/`: database client and Drizzle schema
- `e2e/`: Playwright end-to-end tests
- `WorkLogs/`: shared work logs and team-level collaboration documents

### Data and Auth Conventions
- Keep the database schema in Drizzle, not Prisma.
- Treat Neon PostgreSQL as the database source of truth.
- Keep Better Auth configuration aligned with the Drizzle schema and DB client.
- Do not introduce SQLite-specific assumptions into new code or documentation.

### Hardening Conventions (2026-07-04, detail in CLAUDE.md)
- Every server action gates itself (`requireActionSession`/`requireActionAdmin`) and wraps its body in `runAction` (`src/lib/actions/run-action.ts`) so infra failures return a typed `{ error }`.
- Independent queries in a render fan out with `Promise.all`; never stack sequential awaits (historical prod 503 cause).
- Unbounded list queries take a LIMIT (convention 200).
- No transactions on the Neon HTTP driver: order multi-statement writes so any prefix leaves recoverable state; a single SQL statement is atomic.
- Error boundaries live at `src/app/(app)/error.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, plus `not-found.tsx` files; security headers are set in `next.config.ts` and on the attachment streaming routes.

---

## Testing Standards

### E2E Testing (Playwright)
- Playwright is the required framework for end-to-end browser testing in this repository.
- Critical user-facing flows should have Playwright coverage.
- Prioritize mobile and tablet behaviour because the product is used on phones and tablets in a workshop.
- Prefer assertions on visible behaviour and routing over implementation details.
- Use descriptive test names.
- Keep generated Playwright artifacts under `output/playwright/`.

### Unit Testing
- Unit test tooling is not currently configured.
- If unit tests are introduced later, document the framework explicitly before treating it as a project standard.
- Do not reference `npm test` in workflow docs until that script exists.

### Minimum Verification for Product Changes
- Run `npm exec -- ultracite check`
- Run `npm run build`
- Run `npm run test:e2e` when changing user-facing flows or navigation

---

## Documentation Standards

### Code Comments
- Prefer self-documenting code.
- Add comments for non-obvious logic and explain why a choice exists.
- Avoid noisy comments that restate the code.

### Project Documentation
- Keep `AGENT.md`, `CLAUDE.md`, `PRD.md`, and `WorkLogs/TEAM_CONSTITUTION.md` aligned with the actual project state. `AGENT.md` is a pointer to `CLAUDE.md`; keep it that way so the two cannot drift apart.
- When the stack or workflow changes, update the relevant docs in the same body of work.
- Do not document scripts or tools that do not exist in `package.json`.

---

## Development Workflow

### Branching
- `main` is the current default branch.
- Do not assume a `develop` branch exists.
- If feature branches are used, keep names short and descriptive.

### Commit Messages
- Prefer conventional commit-style subjects such as `feat`, `fix`, `docs`, `refactor`, `test`, or `chore`.
- Scope is optional but useful when the change is localized.

### Review Expectations
- Ensure the documented verification steps have passed for the kind of change being made.
- Call out unresolved risks, missing tests, or placeholder implementations clearly.
- Update documentation when workflow, tooling, or architecture changes.

### Pre-commit Checklist
- [ ] Code follows Ultracite standards: `npm exec -- ultracite check`
- [ ] Production build succeeds: `npm run build`
- [ ] Playwright passes for affected user-facing flows: `npm run test:e2e`
- [ ] Documentation is updated if the change affects workflow, architecture, or tooling

---

## Environment and Deployment

### Environment Variables
- Keep secrets in environment variables.
- Never commit `.env` files.
- Document required variables when adding new ones.

Runtime variables the current code reads:
- `DATABASE_URL` — Neon Postgres connection string. Required for any DB-touching path. A localhost/127.0.0.1 URL switches `src/db/index.ts` to the node-postgres (`pg`) driver so local development and E2E runs can use a plain local Postgres; Neon's HTTP driver is used everywhere else and remains the production path.
- `BETTER_AUTH_SECRET` — required by Better Auth at runtime; without it the library falls back to an insecure default and logs an error.
- `BETTER_AUTH_URL` — canonical deployed URL; needed for callbacks/redirects.
- `NEXT_PUBLIC_APP_URL` — `plain_text`; inlined into the client bundle (used by `src/lib/auth-client.ts` and QR code generation). Must be set at build time.
- `ANTHROPIC_API_KEY` and/or `ZAI_API_KEY` — only required if photo search is enabled.
- `CRON_SECRET` — bearer token guarding `/api/cron/notifications`. The Worker's `scheduled` handler (worker-entry.mjs) sends it when dispatching the notification sweeps declared in `wrangler.jsonc` `triggers.crons`; without it the route returns 503. Set via `wrangler secret put CRON_SECRET` in prod and in `.env.local`/`.dev.vars` for dev and E2E.
- `EMAIL_INTAKE_TOKEN` — bearer token guarding `/api/intake/email` (503 when unset).
- `SEED_USER_PASSWORD` — password for the three seeded accounts. `src/db/seed.ts` fails hard when it is unset and the target database is not localhost (the `blu-crm-dev` fallback is a known string and must never reach a remote database).
- `CHAT_DAILY_MESSAGE_LIMIT` — optional per-user daily assistant message cap (default 200; `/api/chat` returns 429 past it).

### Core Commands
```bash
# Development
npm run dev

# Production build (next build only)
npm run build
npm start

# Cloudflare via OpenNext
npm run preview   # local Worker preview
npm run deploy    # opennextjs-cloudflare build && deploy

# Lint and format
npm exec -- ultracite check
npm exec -- ultracite fix

# End-to-end testing
npm run test:e2e
npm run test:e2e:headed

# Database
npm run db:push        # reads .env.local
npm run db:push:prod   # reads .env.production
npm run db:studio
```

### Deployment Topology and Account Split (read before deploying)

There are two Cloudflare accounts in play, and they are easy to confuse:

- **Live site** — `https://blu-crm.kurt-0f6.workers.dev/` is served by the **Paid** account `0f665cd350543a9c38a78e2c588e7d5e` (its `workers.dev` subdomain is `kurt-0f6`, hence the URL). Every live deployment is `source: wrangler`: the live worker is deployed **only by a local `npm run deploy`**, never by GitHub.
- **GitHub CI** — Workers Builds (the build that runs on push) is connected to a **different, Free** account `6a43583248af9d0fd90ea4a7799b0831`. It deploys a separate `blu-crm` worker that does **not** serve the live URL.

Consequences (all confirmed the hard way):

- **`git push` does not deploy the live site.** To ship to production, run `npm run deploy` locally (wrangler is authenticated to the Paid `0f665…` account). Pushing only updates the dead Free copy.
- The Free CI account rejects `wrangler.jsonc` `limits.cpu_ms` with API error **`100328`** ("CPU limits are not supported for the Free plan"), failing the whole CI build. `limits.cpu_ms` (raising the per-request CPU ceiling for long AI chat turns and attachment rehydration) is valid **only** on the Paid account.
- Always verify a deploy against the live URL with a cache-busted fresh load, and confirm you are on the `0f665…` account (subdomain `kurt-0f6`). The Cloudflare MCP / `cloudflare-builds` tools may be pointed at the Free `6a435…` account, which is **not** the live site.
- Until GitHub CI is repointed at the Paid account, treat `npm run deploy` (local, → `0f665…`) as the only path to production.

### Known Runtime Issues (open, mitigated)

- **Update 2026-07-04:** a probe-caught recurrence refined the diagnosis. The
  hung request (GET /sign-in, network verified healthy by a same-cycle static
  asset fetch) produced NO worker invocation at all: no request event, no
  cancellation, no watchdog fire, no [auth-debug] logs, while requests seconds
  either side ran normally. The stall therefore sits in front of the app
  (Cloudflare edge dispatch, or a workerd invocation that never ends and never
  logs, cf. workerd#6832). App code is exonerated for this manifestation and
  the in-worker watchdog cannot intercept it. Observed frequency ~0.2% of
  requests; a retry always succeeds. Escalation path: Cloudflare support with
  the incident timestamps (2026-07-02 08:21-09:00 UTC in-worker cancels;
  2026-07-04 08:58:21 UTC vanished request, cb=probe1783155501, SYD colo).

- **Intermittent render stall on the Cloudflare (workerd) runtime.** Dynamic renders (full documents AND signed-in RSC navigations, any route) intermittently stall before the response starts: the request burns only ~20-100 ms CPU, no headers are ever sent, no error is thrown, and the invocation ends only when the client disconnects ("Canceled" outcome plus the `waitUntil() tasks did not complete...` warning). Identical requests seconds apart succeed, so it is per-request random, not cold-start, not auth, and not the database — instrumentation (2026-07-02) proved the cookieless path never touches Neon and still hung, while signed-in `/reports` and `/calendar` requests hung in the same incident (one for 38.7 minutes). Local `npm run preview` does NOT reproduce it; it is specific to the deployed runtime, consistent with mid-June 2026 workerd streaming changes (see workerd#6832, opennextjs-cloudflare#1282/#1287). This superseded an earlier incorrect theory that blamed cookieless `getSession`.
  - **Mitigation (live):** `worker-entry.mjs` (wrangler `main`) wraps the OpenNext worker with a first-response watchdog: GET/HEAD requests that produce no Response within 12 s are retried once (unraced, so genuinely slow responses are never cut off). Each catch logs `[hang-watchdog]` to Workers observability.
  - **Diagnosis instrumentation (live, temporary):** `[auth-debug]` timing marks in `src/lib/session.ts`, `src/lib/auth.ts`, `src/db/index.ts`, and the sign-in page localise exactly where a hung render stops. Query with Workers observability (`workers/observability/telemetry/query`, filter `$workers.outcome = canceled` or message contains `hang-watchdog`). Remove both once the upstream bug is fixed.

---

## AI Agent Collaboration and Work Logging

### Purpose
This file also defines how AI agents should collaborate in the repository and record work in `WorkLogs/`.

### Before Starting Work
1. Read `WorkLogs/TEAM_CONSTITUTION.md`.
2. Check `WorkLogs/` for recent task logs before creating a new one.
3. Note overlapping work or dependencies before editing shared files.

### Work Log Requirements
Every AI-created work log must identify:
- **Agent Name / Model**
- **Session ID** if available
- **Timestamp** in ISO 8601 format
- **Mode / Role**

### Work Log Format
```markdown
# Work Log: [Task Title]

**Agent**: [Agent Name/Model]
**Session ID**: [Session Identifier or N/A]
**Mode**: [Mode/Role]
**Date**: [ISO 8601 Timestamp]
**Duration**: [Optional]

## Task Description
[Brief description]

## Actions Taken
- [Specific actions]

## Decisions Made
- [Technical decisions and rationale]

## Issues Encountered
- [Problems and resolutions]

## Next Steps
- [Follow-up actions]

## Related Files
- [Files referenced or changed]
```

### Work Log File Naming
Use:

```text
[YYYY-MM-DD]_[agent-name]_[task-name].md
```

Example:

```text
2026-04-02_codex_team-constitution-reconciliation.md
```

### Collaboration Rules
1. Read before write.
2. Reference related logs when continuing earlier work.
3. Record blockers, assumptions, and handoff details clearly.
4. If work is incomplete and intended for handoff, note that explicitly in the log.

---

## Constitution Maintenance

- Update this document when the implemented stack, scripts, or workflow change.
- Prefer small, accurate corrections over broad aspirational edits.
- If this file conflicts with the codebase, fix the file promptly.
