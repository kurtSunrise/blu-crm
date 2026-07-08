# Work Log: Assistant v3 Phase 4: knowledge admin, composer power, thread compaction, voice-note filing

**Agent**: Claude Fable 5 (claude-fable-5)
**Session ID**: a4b4700f (continuation of a8cc1e79)
**Mode**: Interactive (roadmap approved by Kurt; phase order 3, 4, then 2)
**Date**: 2026-07-08T (see deploy commit for exact rollout time; suites completed 2026-07-07T23:43Z UTC)

## Task Description

Phase 4 of the Assistant v3 roadmap, four features: (1) knowledge-base admin UI at /settings/knowledge replacing the CLI-only import; (2) composer power: slash commands, @-mentions of deals/contacts, edit + resubmit of the last user message, copy-thread-as-Markdown; (3) thread compaction replacing the silent 40-message truncation with a rolling Haiku summary; (4) voice-note retention and filing, closing PRD FR-7.7 (the original audio now persists and attaches to the logged activity). A separate work log by the knowledge workstream covers 4.1 in detail (2026-07-07 assistant-v3-phase4-knowledge-admin).

## Actions Taken

- Three parallel workstreams (knowledge vertical; chat server: schema/threads/route/transcribe/attachments/page-context/deal-tools; composer UI: composer-menus, thread-export, edit affordance, voice chips) plus integrator work: a new session-gated GET /api/chat/entity-search route for the mention typeahead (built preemptively when recon showed no client-callable entity search existed) and the input-aware live confirmation summary.
- **Compaction**: chat_thread.summaryText/summaryUpTo; maybeCompactThread runs post-turn inside the existing waitUntil (threads over 30 messages, refreshed after 10 new ones), summarising with hardcoded Haiku 4.5; loadThreadMessages prepends a <thread_summary> synthetic user turn when trimmed history is covered. Consecutive user-role head turns verified acceptable against the live API.
- **Edit + resubmit**: rollbackForEdit (shared scan/delete core with regenerate, same executed-write conflict rule, plan denial sequenced crash-safe before deletion); editedMessage in the chat body (mutually exclusive, 4000-char cap); pencil affordance on the last user message wired through runConfig.custom like regenerate.
- **Voice**: transcribe stores the recording via the shared storeChatAttachment helper and returns { text, attachmentId }; composer shows a removable "Voice note attached" chip; log_activity gained audioAttachmentId and attaches the recording to the deal.
- **Adversarial review (two finder agents + verification)**: 7 findings, 4 fixed pre-commit: (1) CRITICAL: the model could never learn a voice note's attachment id (audio is filtered from model content), so FR-7.7 filing was dead on arrival; fixed by surfacing "audioAttachmentId: {id}" inside <page_context> when a message carries audio. (2) Filing shared one R2 fileKey between chat and deal rows while the deal DELETE purges R2 unconditionally; fixed by copying bytes to a deal-owned key. (3) IDOR: buildMediaRefBlocks/linkAttachmentsToThread accepted client-supplied attachment ids with no uploader scoping; both now uploadedBy-scoped. (4) Recompaction dropped context older than the 220-message span; the prior summary now folds into the refresh prompt. Accepted with rationale: consecutive-user-turn head (live-API verified fine), stale composer mentions/voice chips on edit paths (visible, guarded), dangling audit rows after edit rollback (audit permanence is intended, regenerate precedent).
- **Tests**: mock server gained a non-streaming JSON branch (making compaction fully e2e-testable), a request log endpoint, and a voice-filing scenario that reads audioAttachmentId out of page context exactly as the real model would. New: e2e/ai-assistant-phase4.spec.ts (11 tests) + e2e/knowledge-admin.spec.ts (3 tests): 13 passed, 1 designed skip (real Whisper retention needs a responsive AI binding; the probe self-skips). Regression across the shared-mock AI specs: 39 passed. Full suites: desktop and phone all passed (154/140), tablet single-worker passed (see deploy commit). Evals 15/15 (no new fixtures needed; no new model-facing tools).

## Decisions Made

- Voice-note ids travel via <page_context> (stripped from display, replayed to the model) rather than message text: least-context, invisible to the user, and the only channel since audio never reaches the model.
- The deal attachment copies bytes (5 MB cap) instead of refcounting a shared R2 key: two rows owning one object made deletion semantics wrong in both directions.
- The Edit pencil still renders on the client-appended approval bubble after an executed plan, where the server refuses with a clear 409; accepted the same way v2 accepted the equivalent regenerate affordance (safe refusal over fragile client heuristics).
- Sweep note from the e2e pass: marker-titled test threads without a deal link accumulate on the staging DB (pre-existing suite behaviour); widening the sweep risks matching real content, left as is.

## Issues Encountered

- Two agents were cut off by session limits mid-write and one by a transient server error; all resumed from transcript and completed. The knowledge agent's build check caught the composer agent's in-flight half-edit exactly as expected from parallel work; it resolved before integration.
- The mock server's broad /capture/i trigger began hijacking mention tests once page-context carried mentioned-deal headers containing the stage name "Lead Captured"; tightened to /capture this enquiry/i.

## Next Steps

- Phase 2 (parked branch phase-2-proactivity): rebase onto main (expect conflicts in chat-launcher.tsx and notification-types.ts), integrate, review, e2e, deploy. This completes the roadmap.
- PRD updates ride with the Phase 2 docs pass: FR-7.7 closure (audio retained + attached), FR-7.8 memory exception note, FR-8.2 completion.
- Consider hiding the Edit affordance on post-plan approval bubbles later if the safe 409 annoys in practice.

## Related Files

- New: src/lib/ai/knowledge-chunks.ts, src/lib/mutations/knowledge.ts, src/lib/actions/knowledge-actions.ts, src/lib/validation/knowledge.ts, src/app/(app)/settings/knowledge/page.tsx, src/components/knowledge-doc-editor.tsx, src/components/ai/composer-menus.tsx, src/components/ai/thread-export.ts, src/app/api/chat/entity-search/route.ts, e2e/ai-assistant-phase4.spec.ts, e2e/knowledge-admin.spec.ts
- Modified: schema (chat_thread summary columns), threads.ts, chat route, transcribe route, attachments.ts, page-context.ts, deal-tools.ts, tools/index.ts, embeddings.ts, knowledge-import.ts, settings-nav.tsx, chat-panel.tsx, chat-launcher.tsx, ai-runtime-provider.tsx, ai-context.tsx, voice-input-button.tsx, e2e/mock-anthropic-server.ts
- Prior logs: 2026-07-07 assistant-v3-phase4-knowledge-admin (workstream detail), 2026-07-07 assistant-v3-phase3-memory-citations
