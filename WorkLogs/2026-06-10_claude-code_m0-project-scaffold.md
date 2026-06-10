# Work Log: M0 Project Scaffold — Blu CRM Foundations

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: N/A
**Mode**: Implementation (autonomous)
**Date**: 2026-06-10T13:00:00+08:00
**Duration**: ~30 minutes

## Task Description

The repository contained only documentation (PRD.md, CLAUDE.md, AGENT.md,
TEAM_CONSTITUTION.md). Scaffolded the full M0 foundation per PRD §12.1 and
created project-specific Claude Code agents in `.claude/agents/`.

## Actions Taken

- Scaffolded Next.js 16.2.9 (App Router, React 19.2.4, TypeScript, Tailwind 4,
  Turbopack) via create-next-app, merged into the repo without touching
  existing docs.
- Installed runtime deps: drizzle-orm, @neondatabase/serverless, better-auth,
  @anthropic-ai/sdk, @opennextjs/cloudflare. Dev deps: drizzle-kit, wrangler,
  @playwright/test, ultracite, @biomejs/biome, dotenv-cli, tsx.
- Replaced eslint with Biome via Ultracite (`biome.jsonc` extends
  `ultracite/biome/core`; one scoped override for generated shadcn primitives).
- Initialised shadcn/ui with **Base UI** primitives (style `base-nova`,
  neutral palette) and added button, card, input, label, badge, textarea,
  select, avatar, separator.
- Wrote the Drizzle schema (`src/db/schema.ts`): Better Auth tables
  (user/session/account/verification, plus `role` on user) and CRM tables per
  PRD §7 — pipeline_stage, company, contact, deal, activity, follow_up, quote,
  attachment, notification — with AUD integer cents, timestamptz, soft-delete,
  and created_by/updated_by audit columns.
- Better Auth wired (`src/lib/auth.ts`, `src/lib/auth-client.ts`,
  `src/app/api/auth/[...all]/route.ts`) with email/password enabled.
- `src/db/seed.ts` seeds Blu's eight default stages idempotently
  (`npm run db:seed`).
- Cloudflare config: `wrangler.jsonc` (worker `blu-crm`, R2 binding
  `PHOTO_BUCKET` → `blu-crm-photos`), `open-next.config.ts`,
  `initOpenNextCloudflareForDev()` in `next.config.ts`.
- Playwright config with phone (Pixel 7), tablet (iPad Pro 11), and desktop
  projects; artifacts under `output/playwright/`; smoke test in
  `e2e/smoke.spec.ts`.
- Branded dark-theme landing page listing the PRD §8 modules with milestone
  badges; metadata set to Blu CRM.
- `.env.example` documenting all runtime variables; `.env.local` created with
  a generated BETTER_AUTH_SECRET and a placeholder Neon DATABASE_URL.
- Created five project agents in `.claude/agents/`: crm-ui, data-layer,
  e2e-tester, cloudflare-ops, work-logger.
- package.json scripts match the constitution: dev/build/start, preview,
  deploy, db:push, db:push:prod, db:seed, db:studio, test:e2e,
  test:e2e:headed.

## Decisions Made

- **Push-based Drizzle workflow** (no committed migrations yet) matching the
  constitution's db:push scripts; revisit migrations once the schema settles.
- **Microsoft 365 SSO deferred within M0**: requires an Entra app
  registration the repo cannot create; env vars are documented in
  `.env.example` and a note sits in `src/lib/auth.ts`.
- **Stage weightings** seeded with first-pass defaults (5→70%, Won 100,
  Lost 0) — explicitly admin-editable; PRD open question Q2.
- **AI thread/message tables deferred to M4** to keep M0 schema reviewable;
  the rest of PRD §7 is in.
- **`schema` named aggregate export** instead of namespace imports to satisfy
  Ultracite's noNamespaceImport rule.

## Issues Encountered

- New shadcn CLI changed flags: `-b` now selects primitives (radix/base), and
  presets are interactive — resolved with `-b base -p nova`.
- The scaffold's `.env*` gitignore rule would have hidden `.env.example`;
  added `!.env.example`.
- Playwright strict-mode/exact-text failures on the landing page card titles;
  fixed by wrapping module names in their own element.

## Next Steps

- Replace the placeholder `DATABASE_URL` in `.env.local` with a real Neon
  connection string, then run `npm run db:push` and `npm run db:seed`.
- Register the Entra ID app and wire Microsoft SSO (M0 exit criterion).
- Set up CI (M0 includes a CI + Playwright harness).
- M1: kanban board, deal record, contacts/companies with duplicate detection,
  quick-add, activities/timeline.
- Docs note: CLAUDE.md/AGENT.md still carry the "Blu Shed — Workshop
  Inventory Portal" heading and some Blu Shed-specific testing guidance
  (QR/vision flows) — should be reconciled to Blu CRM per the constitution's
  documentation standard.

## Related Files

- package.json, biome.jsonc, playwright.config.ts, wrangler.jsonc,
  open-next.config.ts, next.config.ts, drizzle.config.ts, .env.example
- src/db/schema.ts, src/db/index.ts, src/db/seed.ts
- src/lib/auth.ts, src/lib/auth-client.ts, src/app/api/auth/[...all]/route.ts
- src/app/layout.tsx, src/app/page.tsx, src/components/ui/*
- e2e/smoke.spec.ts
- .claude/agents/{crm-ui,data-layer,e2e-tester,cloudflare-ops,work-logger}.md
