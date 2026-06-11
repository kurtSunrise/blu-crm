# Work Log: M4 Phase 1 — AI Assistant Foundation (Chat + Read-Only Tools)

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: 2a4f940a-d85e-4e3e-a995-9b577ce87558
**Mode**: Implementation (approved plan: M4 AI chat + artifacts, Billify pattern)
**Date**: 2026-06-11T13:30:00+08:00

## Task Description

First shippable slice of the M4 AI assistant (PRD §6 FR-7): a streaming chat
panel mounted in the app shell, backed by `/api/chat` running a manual
Claude agentic loop with read-only tools (NL pipeline queries, deal/contact
summaries, draft writing). Mirrors Billify's architecture: @assistant-ui/react
UI primitives + custom ChatModelAdapter + line-based JSON stream protocol +
server-side tool registry + DB-persisted threads.

## Actions Taken

- Installed `@assistant-ui/react@0.12.10` + `@assistant-ui/react-markdown@0.12.3`
  (pinned exact: 0.12.28 ships a broken `@assistant-ui/core`/`store` pair that
  fails `next build`; these are the versions Billify's lockfile proves out).
- Schema: added `chat_thread`, `chat_message` (raw Anthropic content blocks,
  replayable), `ai_audit_log` (+ enums) and pushed to the dev Neon DB.
- AI core under `src/lib/ai/`: client factory (`AI_MODEL` env, default
  `claude-opus-4-8`; `isAiConfigured()`), byte-stable system prompt with
  brand-voice + injection rules, server-side `<page_context>` builder
  (least-context: ids in, entity headers out), NDJSON stream protocol,
  manual agentic loop (`messages.stream()`, adaptive thinking, cache_control
  on system, 8-iteration cap), thread persistence with replay trimming.
- Tools (`src/lib/ai/tools/`): zod→JSON Schema registry; read tools
  `query_deals`, `get_deal`, `get_contact`, `get_company`,
  `list_pipeline_stages`, `list_team_members`, `get_inbox_leads`; ungated
  `present_draft` (follow-up email/SMS, call script, qualification
  questions, quote cover note). Write tools land in Phase 2 behind
  confirmation gating.
- `POST /api/chat`: streaming NDJSON route; 503 + client offline state when
  `ANTHROPIC_API_KEY` unset (graceful degradation).
- UI (`src/components/ai/`): ai-context, runtime provider with async
  generator adapter (true incremental streaming), chat panel (assistant-ui
  primitives restyled with Blu tokens), launcher in desktop sidebar + mobile
  header, dock (mobile full-screen / desktop 400px right sidebar; main
  content gets `md:pr-[400px]` when open), artifact cards (deal list, deal
  card, draft message) rendered via data parts.
- E2E: `e2e/mock-anthropic-server.ts` (scripted SSE keyed on request
  content; wired via `ANTHROPIC_BASE_URL`), playwright.config gained a
  second webServer + env, `e2e/ai-assistant.spec.ts` (streamed reply, real
  tool execution rendering the inbox artifact, axe WCAG A/AA scan of the
  open panel). Specs skip with a clear message when reusing a dev server
  that lacks the mock env.

## Decisions Made

- **No hard auth requirement on /api/chat**: route gating isn't wired
  anywhere in the app yet (M0 SSO pending), so the route falls back to the
  first seeded user when no Better Auth session exists. Tighten to 401 when
  auth ships.
- **Static tool set across all pages** for prompt-cache stability; page
  relevance is steered by the user-turn `<page_context>` block.
- **Exact-pinned assistant-ui versions** (see above) — revisit upgrades
  deliberately.
- Fixed the in-flight `open-next.config.ts` R2 cache import to the real
  subpath (`overrides/incremental-cache/r2-incremental-cache`) and added the
  required `NEXT_INC_CACHE_R2_BUCKET` binding (bucket `blu-crm-cache`,
  must be created before the next deploy).
- Extracted `buildFacts()` on `/deals/[id]` to clear the cognitive-
  complexity lint that pre-dated this work.

## Issues Encountered

- `@assistant-ui/react@0.12.28` → build failure (`tapClientLookup` missing
  from `@assistant-ui/store@0.2.14`); resolved by exact-pinning 0.12.10.
- Playwright reuses an already-running dev server, which lacks the mock AI
  env; verified against a `next start -p 3100` instance instead. Full runs
  on a fresh machine/CI boot both webServers automatically.

## Verification

- `npm exec -- ultracite check` — clean (179 files).
- `tsc --noEmit` — clean.
- `npm run build` — passes; `/api/chat` registered.
- `e2e/ai-assistant.spec.ts` — 9/9 pass (phone, tablet, desktop) against
  the mock-backed server: streaming text, real `get_inbox_leads` execution
  against the dev DB with the artifact card rendering the seeded lead, axe
  scan clean.

## Next Steps

- Phase 2: hoist mutation cores to `src/lib/mutations/`, gated write tools,
  confirmation round-trip, `ai_audit_log` lifecycle, `data_changed` →
  `router.refresh()`.
- Phase 3: editable lead-intake / draft artifacts (two-way sync).
- Phase 4: thread list + resume UI. Phase 5: scoring, voice notes, eval set.
- `npm run preview` check of NDJSON streaming on workerd (do before first
  deploy of the assistant; also create the `blu-crm-cache` R2 bucket).
- Real-API smoke test once `ANTHROPIC_API_KEY` lands in `.env.local`
  (verify `cache_read_input_tokens > 0` on a second turn).

## Related Files

- `src/lib/ai/**`, `src/app/api/chat/route.ts`, `src/components/ai/**`
- `src/db/schema.ts`, `src/components/app-shell.tsx`
- `e2e/ai-assistant.spec.ts`, `e2e/mock-anthropic-server.ts`,
  `playwright.config.ts`, `.env.example`, `package.json`
- `open-next.config.ts`, `wrangler.jsonc` (R2 cache fix alongside the
  user's Cloudflare stability work)
