# Work Log: Harden the AI Assistant against hangs

**Agent**: claude-opus-4-8 (Claude Code)
**Session ID**: 8cc896e0-a0f3-4ced-9a32-3d06e7630ff4
**Mode**: Plan → implement (hardening / reliability)
**Date**: 2026-06-26T00:00:00Z

## Task Description

A user pasted a long Squarespace form-submission email into the AI Assistant and
asked it to summarise it; the reply "seemed to hang" (composer showed work in
progress but nothing arrived). Investigate and harden the streaming path.

## Actions Taken

- Diagnosed the hang as a cluster of missing safeguards rather than one bug:
  - The agent loop runs `thinking: { type: "adaptive" }`; only `text_delta` was
    forwarded to the client, so during a long silent thinking phase the client
    received nothing after the initial `thread` event and looked dead.
  - No `AbortController` / idle watchdog / overall deadline on the Anthropic
    fetch or the `assembleMessage` read loop — a stalled upstream awaited forever.
  - No client-side stall watchdog; the browser fetch carried only the user's
    cancel signal.
  - No input cap on the pasted message.
- `src/lib/ai/client.ts`: added a shared `AbortController` with an idle watchdog
  (resets per chunk) and an overall deadline, both env-tunable
  (`AI_IDLE_TIMEOUT_MS` default 30s, `AI_OVERALL_TIMEOUT_MS` default 120s);
  abort surfaces as a friendly `TIMEOUT_MESSAGE`. Extended the stream callback
  to a `StreamHandlers` object (`onText` + `onActivity`); `onActivity` fires on
  `ping` and `thinking_delta`. `createMessage` (eval/attachment path) also gets
  the overall deadline.
- `src/lib/ai/stream-protocol.ts`: added a
  `{ type: "status"; state: "thinking" | "responding" }` payload.
- `src/lib/ai/agent-loop.ts`: emit `status: "thinking"` (once per iteration) on
  `onActivity` and `status: "responding"` on the first text delta.
- `src/components/ai/ai-runtime-provider.tsx`: combined the user abort signal
  with an internal stall controller via `AbortSignal.any`; reset a stall
  watchdog (45s) on every payload; on a non-user abort show a retryable message;
  render a transient "Thinking…" placeholder on `status`. Extracted
  `buildRequestBody`, `startTurn`, `snapshotOf`, and `applyPayload` to keep
  `run()` under the cognitive-complexity limit.
- `src/app/api/chat/route.ts`: capped `message` at 16,000 chars.
- E2E: `e2e/mock-anthropic-server.ts` gained two streamed scenarios — a stall
  (open then silent) and a thinking turn (ping, ~2s pause, then text);
  `playwright.config.ts` sets `AI_IDLE_TIMEOUT_MS=3000` for the dev server so the
  stall trips fast; `e2e/ai-assistant.spec.ts` adds a thinking-indicator test and
  a stall→retryable-error test.

## Decisions Made

- Left model config (`max_tokens`, adaptive thinking) unchanged per the user's
  choice; relied on timeouts + the status signal to fix the perceived hang.
- Idle watchdog is safe alongside long thinking because Anthropic keeps emitting
  ping/thinking events; the gap only grows on a genuine stall.
- Client stall timeout (45s) is intentionally longer than the server idle timeout
  so the server's own retryable error wins first; the client guard is the
  backstop for a dropped connection.
- Made the server timeouts env-tunable (mirrors `AI_MODEL`) so they change
  without a deploy and the suite can shrink the idle window.
- Preserved two prior contracts flagged in earlier logs: the synchronous
  `decisionRef` consumption (M4 phase-4 superseded-write race fix) and the
  `Attachment.id`/`attachmentIds` plumbing in the adapter.

## Issues Encountered

- First mock attempt cleared the delayed-write timer via `req.on("close")`, which
  fires as soon as the request body is read — the thinking answer never sent.
  Fixed by switching to `res.on("close")` (client-disconnect) plus a
  `res.writableEnded` guard. Verified directly against the mock: thinking streams
  text at ~2.0s; stall stays silent.
- Full Playwright suite could not be executed here: global-setup sign-in returns
  401 on the shared remote Neon DB and seeding is intentionally skipped (see
  `WorkLogs/2026-06-16…file-upload` and project memory). Specs are written to run
  in a properly seeded e2e env.

## Verification

- `npm exec -- ultracite check` on all 8 changed files: clean.
- `npm run build`: succeeded (type-check gate passed).
- Mock SSE framing/timing validated by direct curl of both scenarios.
- E2E specs added but not run locally (known auth/seed blocker).

## Next Steps

- Run `e2e/ai-assistant.spec.ts` in a seeded e2e environment (phone + tablet
  projects) to confirm the two new specs pass.
- Still-open M4 handoff: verify NDJSON streaming on workerd via `npm run preview`
  before the next prod deploy (open since M4 Phase 1) — directly relevant here.

## Related Files

- `src/lib/ai/client.ts`
- `src/lib/ai/agent-loop.ts`
- `src/lib/ai/stream-protocol.ts`
- `src/components/ai/ai-runtime-provider.tsx`
- `src/app/api/chat/route.ts`
- `e2e/mock-anthropic-server.ts`, `e2e/ai-assistant.spec.ts`, `playwright.config.ts`
