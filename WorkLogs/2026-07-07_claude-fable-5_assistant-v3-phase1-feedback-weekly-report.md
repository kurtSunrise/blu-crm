# Work Log: Assistant v3 Phase 1: message feedback, weekly report tool, persisted sources/reasoning, usage panel

**Agent**: Claude Fable 5 (claude-fable-5)
**Session ID**: a8cc1e79-cef9-4f07-9ccb-494d1ce62ffb
**Mode**: Interactive (plan approved by Kurt; deploy explicitly requested)
**Date**: 2026-07-07T06:56:24Z

## Task Description

Phase 1 of the approved "Assistant v3 best-in-class gap closure" roadmap (`~/.claude/plans/smooth-sniffing-snowflake.md`), which came out of a competitor and best-practice gap analysis of the 2026-07-07 v2 assistant. Scope decisions recorded from Kurt: email/SMS sending is out entirely, thread sharing is out, memory (Phase 3) will be auto-save with a review UI, and all three proactive surfaces (Monday weekly report, daily briefing, needs-attention nudges) are wanted in Phase 2. Phase 1 shipped: message feedback (thumbs + category/comment), a `get_weekly_report` tool with a 7-section artifact card (FR-8.2 one-tap half), persisted reasoning/sources across thread resume (closing the v2 accepted gap), knowledge source freshness, and an admin usage panel on /settings/ai. Committed as 007531a and deployed to prod (version a5112246).

## Actions Taken

- Ran three parallel workstreams on disjoint files (data layer, AI core, UI), then an integrator pass over the merged tree.
- **Data layer**: `chat_feedback` table (pgEnum rating, unique (message_id, user_id) upsert target, thread+user index), `src/lib/ai/feedback.ts`, zod schema `src/lib/validation/chat-feedback.ts`, POST `/api/chat/feedback` (session-gated, 404 on foreign messages, "clear" deletes), thread GET now returns the caller's ratings, `src/lib/ai/analytics.ts` aggregates.
- **AI core**: `get_weekly_report` read tool wrapping `getWeeklyReport()` verbatim (dashboard-reconciled numbers, compact text summary to the model, full data as a `weekly_report` artifact), `stream-protocol.ts` artifact/source type additions, reasoning + deduped sources persisted as `chat_artifact` rows on both the normal end-of-turn AND the confirmation-pause path, `knowledge.ts` exposes doc `updatedAt` through `SourceRef`, weekly-report follow-up suggestion rules.
- **UI**: thumbs up/down with inline detail form (category chips + comment), per-message sequenced POST queue, optimistic state seeded on resume via an invisible `message_meta` data part; `weekly-report-artifact.tsx` 7-section card; resumed reasoning renders as a real reasoning content part above the answer; source chip freshness tooltip; `assistant-usage-panel.tsx` on /settings/ai; Ask AI prefill on /reports/weekly; assistant action bar now always visible on touch devices.
- **Verification**: ultracite clean; production build clean; e2e desktop 133 passed, phone 134 passed, tablet 113 passed (`--workers=1`), skips are the designed ones; `npm run ai:eval` 13/13 (100%) including the new `weekly-report-tool` fixture.
- **Prod rollout in order**: `df -h /` (29 GiB free); `npm run db:push:prod` (chat_feedback + indexes, additive); commit 007531a; deploy via the two-phase font-fetch recipe (`NODE_OPTIONS="--no-network-family-autoselection"` scoped to the opennextjs BUILD only, then a plain deploy); verified version a5112246 is the live (bottom) entry in `wrangler deployments list`; cache-busted live loads returned 200.

## Decisions Made

- **Feedback POSTs are sequenced per message** (promise queue) with only the newest request allowed to revert optimistic state: an independent verify pass showed the bare down-rating POST could land after the detail POST and null out the category/comment. The e2e agent hit the same race in a real run.
- **Persisted sources keep the wire shape `{ sources }`** rather than a bare array, so chat_artifact rows and stream payloads parse identically.
- **Resumed reasoning becomes a real reasoning content part** (mapped in chat-launcher), not a data part, so it renders through the live ReasoningSection above the answer text; a near-duplicate resumed-only component was deleted.
- **Reasoning/sources persist on the confirmation-pause path too**: the post-approval continuation starts a fresh turn with empty accumulators, so pausing without persisting silently dropped them (review finding).
- **Usage panel is labelled "Write actions by tool"**, not "Top tools": only gated writes reach ai_audit_log; read tools run inline and are uncounted, and the honest label prevents a wrong "nobody uses the knowledge base" conclusion.
- **Weekly-report artifact types derive from reports.ts via type-only imports** (erased at compile time, so the isomorphic constraint holds) instead of hand-duplicated interfaces that would drift.
- Shared `toIsoOrNull` and `formatDayMonthAwst` added to `src/lib/format.ts`, replacing three private date-helper copies (knowledge.ts, report-tools.ts, contacts-directory-data.ts).

## Issues Encountered

- **A workflow-backed review of the merged tree produced 11 verified findings; all fixed before commit.** Beyond those above: a missing thread-lookup index on chat_feedback, and a literal NUL byte as a source-dedupe separator in `ai-runtime-provider.tsx` (committed in c8f34e5, same defect class the v2 integrator fixed in knowledge-tools.ts) which made git treat the file as binary; replaced with a JSON key so the file diffs as text again.
- **The e2e workstream stalled twice**: once on a session limit mid-write, and once waiting on a Playwright run that had died under a stale `next dev` server on port 3000 (the known hang cause). Killed the stale server and ran the suites directly.
- Two pre-existing e2e test bugs fixed in passing (regenerate-409 copy assertion matched the wrong error path; a `getByRole` substring match strict-mode collision with fixture names, fixed with `exact: true`).

## Next Steps

- Phase 2 of the approved plan: scheduled Monday weekly report via cron into per-user threads + notification, daily morning briefing, needs-attention nudges deep-linking into the assistant. (Cron route, wrangler crons additions, notification types.)
- Phase 3: assistant memory (auto-save + review UI per Kurt) and native Anthropic citations. Phase 4: knowledge admin UI, composer power (@-mentions, slash commands, edit+resubmit, export), thread compaction, voice audio retention (FR-7.7 closure).
- Add a dated help-page What's New entry for Phase 1 (deferred; batch with Phase 2's entry if it ships soon).
- Consider a script exporting thumbs-down messages as candidate eval fixtures once real feedback accumulates.
- PRD/constitution touch-ups for FR-8.2 (one-tap half delivered) ride with Phase 2 when the scheduled half completes the requirement.

## Related Files

- Commit 007531a (29 files). New: src/lib/ai/feedback.ts, src/lib/ai/analytics.ts, src/lib/ai/tools/report-tools.ts, src/lib/validation/chat-feedback.ts, src/app/api/chat/feedback/route.ts, src/components/ai/artifacts/weekly-report-artifact.tsx, src/components/assistant-usage-panel.tsx
- Plan: ~/.claude/plans/smooth-sniffing-snowflake.md (full 4-phase roadmap + out-of-scope record)
- Prior log: WorkLogs/2026-07-07_claude-fable-5_ai-assistant-best-in-class-upgrade.md (v2; this phase closes its "sources/reasoning do not reappear on resume" accepted gap)
