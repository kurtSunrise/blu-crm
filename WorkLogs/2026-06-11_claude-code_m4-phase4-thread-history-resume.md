# Work Log: M4 Phase 4 — Persisted Thread UX + History

**Agent**: Claude Code
**Mode**: Implementation (continuation of the approved M4 assistant plan)
**Date**: 2026-06-11

## Task Description

Phase 4 of the M4 assistant: surface the threads that Phase 1 has been
persisting all along. The panel gains New conversation, a history view of
recent threads, and resume: picking a thread loads its transcript into the
panel and continues the same persisted conversation server-side.

## Actions Taken

- **API**: `GET /api/chat/threads` (recent non-archived threads for the
  user, most recently active first, limit 30) and
  `GET /api/chat/threads/[id]` (ownership-checked readable transcript).
  `resolveAssistantUser` moved from the chat route into
  `src/lib/ai/assistant-user.ts` so all three routes share the same
  identity fallback.
- **threads.ts**: `listThreadsForUser` and `loadThreadDisplayMessages`.
  Display mapping is text-only and oldest-first: page-context blocks,
  tool_use/tool_result plumbing, and confirmation round-trip turns are
  model-facing and stay out of the transcript.
- **Dock** (`chat-launcher.tsx`): header gains New conversation and
  History buttons. The runtime subtree is keyed by a session epoch; new
  chat and resume each remount it (a LocalRuntime's `initialMessages` are
  fixed at creation), while toggling history only hides the live chat so
  an in-flight conversation is never lost by peeking at the list.
- **`thread-history.tsx`**: fetches the list on open; loading skeletons,
  error and empty states; rows show title, Perth-relative day, an
  "Awaiting confirmation" badge for threads parked on a gated write, and
  highlight the active thread.
- **`ai-runtime-provider.tsx`**: accepts `initialMessages` and passes it
  to `useLocalRuntime`.
- **Fixed a confirmation race (latent since Phase 2)**: the card stored
  the decision in React state, then appended the "Approve"/"Cancel"
  bubble; the adapter run reads a ref that was only synced by an effect,
  so a run starting before the effect sent a plain message and the server
  denied the pending write as superseded. The decision channel is now a
  shared mutable ref on the context, written synchronously before
  `append()`. Phase 4's render-timing changes exposed this as real test
  failures (audit row `denied` after clicking Confirm).
- **E2E**: "a conversation can be resumed from history" drives the whole
  loop: chat → new conversation resets to welcome → resume from history
  restores the transcript → continuing appends to the same thread (DB
  asserts exactly one thread carries the marker title).

## Decisions Made

- Resuming a thread whose status is `awaiting_confirmation` does not
  resurrect the confirmation card (data parts are not persisted); the
  existing supersede path denies the parked write when the user continues,
  so nothing can be applied without an explicit confirm. The history row
  flags these threads with a badge.
- Thread listing works without `ANTHROPIC_API_KEY`: reading old
  conversations is useful even while the model is offline.

## Verification

- `npm exec -- ultracite check` — clean (193 files).
- `tsc --noEmit` — clean.
- `npm run build` — passes; both thread routes registered.
- Assistant specs: 24/24 (8 specs x phone/tablet/desktop).
- Full Playwright suite — 227 passed, 3 skipped, 1 tablet intake flake
  that passes in isolation (parallel-run DB contention, pre-existing).

## Next Steps

- Phase 5: P1 extras (lead scoring), eval set, docs.
- Consider persisting artifact/confirmation data parts with messages so
  resumed transcripts can re-render cards (history is text-only today).

## Related Files

- `src/app/api/chat/threads/route.ts`, `src/app/api/chat/threads/[id]/route.ts`
- `src/lib/ai/assistant-user.ts`, `src/lib/ai/threads.ts`
- `src/components/ai/chat-launcher.tsx`, `src/components/ai/thread-history.tsx`
- `src/components/ai/ai-context.tsx`, `src/components/ai/ai-runtime-provider.tsx`
- `src/components/ai/confirmation-card.tsx`, `e2e/ai-assistant.spec.ts`
