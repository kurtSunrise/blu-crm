# Work Log: Assistant v3 Phase 3: cross-thread memory and native knowledge citations

**Agent**: Claude Fable 5 (claude-fable-5)
**Session ID**: a4b4700f (continuation of a8cc1e79)
**Mode**: Interactive (roadmap approved by Kurt; phase order reshuffled by Kurt: 3, then 4, then 2)
**Date**: 2026-07-07T10:28:00Z

## Task Description

Phase 3 of the approved Assistant v3 roadmap: ChatGPT-style cross-thread memory (auto-save with a review UI, per Kurt's explicit decision) and native Anthropic citations on knowledge answers. Kurt reordered the roadmap mid-flight: Phase 2 (proactivity) was parked fully-built-but-unintegrated on the `phase-2-proactivity` branch and ships LAST, after Phase 4. Committed as ed25b70 and live on prod (Worker version b32ab95e; `assistant_memory` pushed to prod Neon first).

## Actions Taken

- Three parallel workstreams on disjoint files (memory server, citations server, UI) with the wire contract pinned in stream-protocol.ts up front; integrator (this session) owned agent-loop.ts and stream-protocol.ts wiring.
- **Memory**: `assistant_memory` table (user + team-wide scope via nullable user_id, soft delete); `save_memory` tool executes INLINE like a read tool (documented FR-7.8 exception: assistant-internal state, never CRM data), audited via new `recordExecutedToolCall`; "Memory saved" chip with one-tap Undo, streamed live and persisted as a `memory_saved` artifact for resume; active memories injected as a third cached system block ("# Remembered context", cap 30, team-wide rows first); review UI on /settings/ai and /settings/account (non-admins manage their own memories there); system prompt gained a "# Memory" section.
- **Citations**: vendored `search_result` / `search_result_location` / `citations_delta` types in anthropic.ts (field names verified against current Anthropic docs and a live streaming call); knowledge passages go to the model as citable search_result blocks via a new `AiToolOutcome.searchResults` capability field (live tool result only; persisted history keeps lean text); `client.ts` fires `onCitation` and accumulates citations into finalMessage content; the loop injects inline " [N]" markers and emits `citation` payloads, numbered by `createCitationNumberer` (src/lib/ai/citations.ts), with the batch `assignCitationMarkers` giving identical numbering on resume; numbered Sources list UI with inline snippet expansion; flat source chips remain the citation-less fallback and are suppressed when citations exist.
- **Adversarial review** (finder angles + verification): 14 findings, 10 fixed before commit. The critical one, found by the cross-file tracer and CONFIRMED against the live API: replayed assistant messages carried citation records whose search_result sources are absent from the replayed request, and the API rejects that with 400 "Invalid search result index in citation", which would have broken every follow-up turn in any knowledge-cited thread. Fixed by stripping citations from replayed content in `loadThreadMessages` (display path unaffected). Also fixed: `buildMemoryBlock` now degrades to no block instead of killing the turn on a memory-table error; duplicate chunk titles get "(part N)" so markers cannot collapse onto the wrong snippet; team-wide memories always win injection slots; disable of team-wide memories is admin-only server-side (matching the UI); consecutive duplicate markers deduped; the 8-char minimum is stated in the tool description; plus three dedup/altitude cleanups (searchResults outcome field replacing a tool-name special case and a JSON re-parse, shared memory-item serializer, shared citations-ordering helper).
- **Verification**: ultracite clean; build clean; e2e green on all three projects (desktop 39 AI-spec passes plus full-suite runs, phone full suite, tablet full suite 114 passed with `--workers=1`); `npm run ai:eval` 15/15 including new memory-save and knowledge-grounding fixtures.
- **Prod rollout in order**: disk check; `npm run db:push:prod` (assistant_memory, additive); commit ed25b70; two-phase deploy (font-fetch recipe); live version b32ab95e verified as the bottom `wrangler deployments list` entry; cache-busted live loads 200. What's New entry added to the 07/07/2026 help block in the follow-up docs commit.

## Decisions Made

- **save_memory is not confirmation-gated** (Kurt's auto-save decision): it runs inline, is always user-scoped when auto-saved, is audited as executed, and every surface offers removal (chip Undo, two settings pages). PRD FR-7.8's "no side effects without confirmation" is scoped to CRM data; this exception is documented in memory-tools.ts.
- **Replay stays citation-free by design**: persisted tool results keep lean text (same tradeoff as image media), so replayed assistant turns must not carry citation records (live-API verified 400 otherwise).
- **Suppress flat source chips when citations exist**: once precise numbered citations are present, rendering uncited retrievals as "From:" chips would imply false attribution. Reviewed and kept deliberately.
- **Accepted divergence**: citation markers sit inline mid-text live but regroup at block ends on resume (numbering identical; the API exposes no answer-text offsets to reproduce live placement). A memory auto-saved in a turn whose co-proposed write is later rejected survives (Undo chip mitigates; assistant-internal state).
- Memory block failure never takes down a turn: `[memory] load-failed` log + null block.

## Issues Encountered

- Two earlier attempts at the workflow-backed review died on session limits; the second returned a misleading empty "no findings" result with all finder agents failed. Re-ran the review inline with consolidated finder angles; treat an empty findings list with failed finders as NO review, not a clean one.
- The e2e agent for Phase 1 had stalled on a dead Playwright run under a stale port-3000 dev server; the Phase 3 e2e agent was briefed to kill stale servers first and run in the foreground, which worked cleanly.
- The tablet full suite took 1.8h under `--workers=1` (expected WebKit slowness, passed 114/1 skipped); a trailing node AggregateError warning after the summary is teardown noise, exit code 0.

## Next Steps

- Phase 4: knowledge admin UI (/settings/knowledge), composer power (@-mentions, slash commands, edit + resubmit, thread export), thread compaction (summary replaces the silent 40-message truncation), voice note retention closing PRD FR-7.7.
- Then Phase 2 (parked on `phase-2-proactivity`): rebase onto main (expect small conflicts in chat-launcher.tsx from the P3 resume-mapping changes and notification-types), integrate, e2e, deploy.
- Watch prod for `[memory] load-failed` and citation behaviour on real knowledge questions; consider a "memory saved" count on the admin usage panel later.
- PRD/CLAUDE.md touch-ups (FR-7.8 memory exception, citations) ride with the Phase 4 docs pass.

## Related Files

- Commit ed25b70 (29 files). New: src/lib/ai/memory.ts, src/lib/ai/citations.ts, src/lib/ai/tools/memory-tools.ts, src/lib/actions/memory-actions.ts, src/lib/validation/memory.ts, src/components/ai/artifacts/citation-list.tsx, src/components/ai/memory-saved-chip.tsx, src/components/assistant-memory-section.tsx, e2e/ai-memory-citations.spec.ts
- Prior logs: 2026-07-07 assistant-v3-phase1 (feedback/weekly report), 2026-07-07 ai-assistant-best-in-class-upgrade (v2)
- Parked: branch `phase-2-proactivity` (commit 5d8149b)
