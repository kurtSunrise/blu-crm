# Blu CRM

**Blu CRM** is a mobile-first client and sales-pipeline portal for Blu Builders (https://blubuilders.com.au/). A three-person sales team (admins Andy and Kurt, sales Jess) runs enquiries through an eight-stage pipeline: intake, quoting, follow-ups, won/lost, reports, and an AI assistant.

Sources of truth:
- `PRD.md` is the product requirements document.
- `WorkLogs/TEAM_CONSTITUTION.md` is the mandatory operating policy, including deployment topology and work-log rules.
- `WorkLogs/` holds the dated build history.

## Team Constitution (Mandatory)

Before doing any work, read and follow `WorkLogs/TEAM_CONSTITUTION.md`.

- If a task conflicts with the constitution, stop and ask the user.
- At the start of each task, summarize the applicable constitution rules before editing.
- Write a work log in `WorkLogs/` when a substantial task finishes.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) on React 19 |
| Language | TypeScript |
| Linting/Formatting | Biome via Ultracite |
| UI Components | shadcn/ui with Base UI primitives |
| Styling | Tailwind CSS 4 |
| E2E Testing | Playwright |
| Database | Neon PostgreSQL (HTTP driver, no transactions) with Drizzle ORM |
| Auth | Better Auth with Drizzle adapter (email/password; optional Microsoft SSO) |
| AI Assistant | Anthropic Claude API (agent loop + tools in `src/lib/ai/`); Cloudflare Workers AI via the `AI` binding in `wrangler.jsonc` (Whisper voice transcription + bge-m3 knowledge embeddings). All vision runs through Anthropic; `ZAI_API_KEY` only satisfies the settings vision-status badge |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` + `wrangler`; `worker-entry.mjs` wraps the OpenNext worker |
| File Storage | Cloudflare R2 (`PHOTO_BUCKET`), private objects streamed via `/api/attachments/[id]` and `/api/chat/attachments/[id]` |

## Commands

```bash
npm run dev                 # dev server
npm run build               # production build (next build --webpack)
npm run preview             # local Cloudflare Worker preview
npm run deploy              # build + deploy to Cloudflare (the ONLY path to prod)

npm exec -- ultracite check # lint (also: npm run check)
npm exec -- ultracite fix   # format + autofix (run before committing)
npm run test:e2e            # Playwright (also: test:e2e:headed)

npm run db:pgvector         # create extension vector; MUST run before db:push (also: db:pgvector:prod)
npm run db:push             # drizzle-kit push, reads .env.local
npm run db:push:prod        # drizzle-kit push, reads .env.production
npm run db:seed             # seed team users + stages (see SEED_USER_PASSWORD)
npm run db:studio           # Drizzle Studio
npm run db:clean:e2e        # sweep e2e data (guarded, sweep-only off localhost)

npm run knowledge:import    # import knowledge/*.md into Postgres for assistant RAG
                            # (embeds via Workers AI REST when CLOUDFLARE_ACCOUNT_ID
                            # + CLOUDFLARE_API_TOKEN are set; warns + null embeddings otherwise)
npm run ai:eval             # assistant eval harness (evals/, 80% pass gate)

# One-off migration/backfill scripts (each has a :prod variant):
# db:migrate-sub-status, db:backfill-stage-events,
# db:backfill-quote-responded, db:backfill-notification-dedupe
```

Verification trio for product changes: `npm exec -- ultracite check`, `npm run build`, and `npm run test:e2e` for user-facing flows.

## Architecture Map

App routes (`src/app/(app)/`, session-gated by the layout): dashboard `/`, `pipeline` (+ `/closed`), `deals` (+ `[id]`, `new`), `contacts`, `companies`, `calendar`, `inbox`, `notifications`, `tasks`, `help`, `reports` (+ `daily`, `weekly`, `deals`, `trends`, `funnel`, `team`), `settings` (+ `account`, `ai`, `company`, `import`, `notifications`, `statuses`, `team`).

Public routes (`src/app/(public)/`): `sign-in`, `enquire` (public enquiry form), `q/[token]` (tokenised client quote view).

API routes (`src/app/api/`): `auth/[...all]` (Better Auth), `chat` + `chat/threads` (list; `[id]` GET/PATCH rename+pin/DELETE soft-archive) + `chat/attachments` + `chat/transcribe` (Workers AI Whisper, 503 when the `AI` binding is absent) (assistant), `attachments` (deal files), `cron/notifications` (CRON_SECRET bearer), `intake/email` (EMAIL_INTAKE_TOKEN bearer), `enquiries` (public, rate-limited + honeypot), `notifications/unread-count`, `reports/export`, `abn-lookup` (session-gated ABR proxy, needs `ABR_GUID`).

`src/lib/` modules: `actions/` (server actions returning typed `*ActionState`), `ai/` (agent loop, tools, threads, knowledge RAG), `validation/` (zod schemas for every action and API body), `mutations/` (shared write cores), plus helpers (`reports.ts`, `alerts.ts`, `notifications.ts`, `session.ts`, `auth.ts`). `src/db/` holds the Drizzle schema, seed, and the driver-switching client.

## Data Layer and Action Rules

- **No transactions.** The Neon HTTP driver runs each statement independently. Order multi-statement writes so any prefix leaves recoverable state (see `deleteStage` in `src/lib/actions/stage-actions.ts`); a single SQL statement is atomic.
- **Never stack sequential awaits in a render.** Fan out independent queries with `Promise.all` (model: `src/lib/contacts-directory-data.ts`). History: ~10 serial Neon queries in one render caused production 503s on workerd.
- **Unbounded list queries get a LIMIT.** Convention is 200 (`REPORT_DEALS_LIMIT` in `src/lib/reports.ts`). Known accepted exception: the contacts directory scans the whole table; revisit with pagination around ~2,000 contacts.
- **Server actions are endpoints.** The `(app)` layout gate does not protect them. Every action must gate itself with `requireActionSession` / `requireActionAdmin` (`src/lib/session.ts`, typed results, no redirect) and wrap its body in `runAction` (`src/lib/actions/run-action.ts`) so infra failures return `{ error }` instead of an unhandled server-action error. `runAction` uses `unstable_rethrow`, so `redirect()`/`notFound()` still work inside it.
- **AI assistant specifics.** Knowledge search is hybrid: Postgres FTS fused with pgvector cosine over bge-m3 embeddings in one SQL statement (logs `[knowledge] hybrid`), with a hard fallback to pure FTS when embedding fails or the `AI` binding is absent (logs `[knowledge] embed-fallback`). Chat persistence: `chat_artifact` re-renders artifact/confirmation cards on thread resume, `chat_thread.pinned_at` drives pinning, `ai_audit_log.message_id` anchors resumed confirmations. Multi-write turns queue as one versioned `PendingPlan` jsonb (legacy single-item shape still parses): per-item approve/skip/edit, sequential execution, stop on first failure, per-item audit including the `skipped` status. Regenerate rolls the thread back to the last plain user turn and reruns; it refuses with 409 when that turn executed writes.
- **Admin-only surfaces**: team management, sub-statuses, stage management, org-wide settings (alerts, AI model/instructions, weightings, tooltip). Everything else is open to any signed-in user by design (single-org, three users; no multi-tenancy).
- **Error boundaries** exist at `src/app/(app)/error.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, plus `not-found.tsx` at root, `(app)`, and `q/[token]`. Keep them client-only, no db/session imports. `global-error.tsx` must own `<html>`/`<body>`.
- **Security headers** are set globally in `next.config.ts` (nosniff, frame-ancestors, HSTS, referrer/permissions policy). The attachment routes add `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox` on streamed files because upload MIME is client-supplied. A script-src CSP is future work (needs nonce plumbing).

## Deployment and Operations (read before deploying)

- **Split-brain accounts.** The live site `https://blu-crm.kurt-0f6.workers.dev/` is served by the Paid Cloudflare account `0f665...` and is deployed ONLY by a local `npm run deploy`. GitHub push CI deploys a dead copy on a separate Free account and never touches prod. `limits.cpu_ms` in `wrangler.jsonc` is Paid-only (Free rejects it with API error 100328).
- **Prod DB is separate.** The live Worker uses its own Neon database via a secret, not the `.env.local` dev database. Migrate prod explicitly with `npm run db:push:prod` (reads `.env.production`). Some rollouts have ordering requirements; check the constitution and WorkLogs (e.g. schema push before deploy for new tables the auth layer reads, such as `rate_limit`).
- **Hang watchdog.** `worker-entry.mjs` (the wrangler `main`) retries GET/HEAD requests that produce no response within 12s, logging `[hang-watchdog]`. It mitigates an intermittent upstream workerd streaming stall. Temporary `[auth-debug]` timing logs exist in `src/lib/session.ts`, `src/lib/auth.ts`, and `src/db/index.ts`; remove them once the upstream bug is fixed.
- **Cron.** `wrangler.jsonc` `triggers.crons` fires the `scheduled` handler in `worker-entry.mjs`, which dispatches an in-memory request to `/api/cron/notifications` with the `CRON_SECRET` bearer (never a network self-fetch; `global_fetch_strictly_public` is enabled).
- **Before deploying**: check free disk (`df -h /`); a full disk has silently shipped a corrupt OpenNext bundle. Verify deploys against the live URL with a cache-busted fresh load.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres. A localhost/127.0.0.1 URL switches `src/db/index.ts` to the node-postgres driver (local dev/E2E) |
| `BETTER_AUTH_SECRET` | Required by Better Auth; insecure fallback without it |
| `BETTER_AUTH_URL` | Canonical deployed URL for auth callbacks |
| `NEXT_PUBLIC_APP_URL` | Build-time inlined; used by auth client + QR generation |
| `ANTHROPIC_API_KEY` / `ZAI_API_KEY` | Anthropic key powers the assistant and all vision; `ZAI_API_KEY` is only checked by the settings AI page's vision-status badge (no Z.AI calls are made) |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | Script-side only: `knowledge:import` embeds chunks via the Workers AI REST API (token needs Workers AI run permission); unset means null embeddings and FTS-only search. The deployed Worker uses the account-authenticated `AI` binding instead |
| `CRON_SECRET` | Bearer guarding `/api/cron/notifications` (503 when unset) |
| `ABR_GUID` | Australian Business Register web-services GUID (free registration) powering `/api/abn-lookup` for the company form's ABN lookup; the route returns 503 when unset |
| `EMAIL_INTAKE_TOKEN` | Bearer guarding `/api/intake/email` |
| `SEED_USER_PASSWORD` | Seed account password. Required for non-local databases; the `blu-crm-dev` fallback is local-only and the seed script fails hard otherwise |
| `CHAT_DAILY_MESSAGE_LIMIT` | Optional per-user daily assistant message cap (default 200, returns 429 past it) |
| `AUTH_RATE_LIMIT_ENABLED` | Set to `true` (via `wrangler.jsonc` vars) to enable Better Auth sign-in rate limiting; the NODE_ENV default never fires on workerd. Off in `next dev`/Playwright |

## Testing and AI Evals

- Playwright is the e2e framework; artifacts go under `output/playwright/`. The suite signs in as the seeded admin. The tablet project is WebKit and needs `--workers=1` to avoid goto hangs.
- The assistant is mocked in e2e via `e2e/mock-anthropic-server.ts`; real-model quality is checked by `npm run ai:eval` (fixtures in `evals/`, 80% pass gate, tools never executed).
- `knowledge/` holds the company knowledge corpus (brand voice, pricing, sales process) imported into Postgres by `npm run knowledge:import` for the assistant's knowledge-base tool.
- Auth accounts are seed-created (`npm run db:seed`); there is no sign-up or password-reset UI.

## Code Style

- Follow Ultracite/Biome; run `npm exec -- ultracite fix` before committing.
- Explicit types where they add clarity; `unknown` over `any`; narrowing over assertions; no non-null assertions.
- Server components by default; `"use client"` only when interactivity requires it. No components defined inside components.
- Validate all user input with zod (`src/lib/validation/`) before persistence.
- Mobile-first UX: large touch targets, fast interactions, legible on phones and tablets.
- Semantic HTML and accessible patterns: labels on inputs, keyboard access, meaningful heading hierarchy.
- No `console.log` leftovers (structured `[tag]` observability logs like `[hang-watchdog]`, `[action-error]`, `[notify]` are the sanctioned exception).
