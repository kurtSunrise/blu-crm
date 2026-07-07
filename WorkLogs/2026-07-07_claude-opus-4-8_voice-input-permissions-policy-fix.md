# Work Log: Voice Input "Microphone Blocked" Permissions-Policy Fix

**Agent**: Claude Opus 4.8 (claude-opus-4-8, 1M context)
**Session ID**: N/A
**Mode**: bug fix + prod deploy
**Date**: 2026-07-07

## Task Description

The assistant's voice-input feature (`VoiceInputButton` in `src/components/ai/voice-input-button.tsx`) always showed "Microphone access is blocked. Allow it in your browser settings." even when the browser/site permission and macOS microphone permission were all granted. Reported by Kurt using Wavebox. The feature had never been exercised since it shipped, so the block was present from day one.

Voice input was added in the assistant upgrades logged in:
- `2026-07-07_claude-fable-5_ai-assistant-best-in-class-upgrade.md` (voice via Workers AI Whisper at `/api/chat/transcribe`)
- `2026-07-07_claude-fable-5_assistant-v3-phase1-feedback-weekly-report.md`

The offending header comes from the security hardening logged in:
- `2026-07-05_claude-fable-5_security-robustness-docs-hardening.md` (added the six global security headers in `next.config.ts`, including `Permissions-Policy`).

## Actions Taken

- Reproduced the symptom from the report and traced it to the global `Permissions-Policy` security header in `next.config.ts`.
- Changed the header value from `camera=(), microphone=(), geolocation=()` to `camera=(), microphone=(self), geolocation=()`.
- Ran `npm exec -- ultracite check` on the file (clean).
- Confirmed local `next dev` emitted the corrected header and the app was healthy. A separate wedged dev-server 500 was cleared by restarting `next dev`; it was unrelated to the fix (caused by editing `next.config.ts` while dev was running, plus stale wrangler/opennext processes).
- Checked free disk before deploying (`df -h /`, 22Gi free) then shipped via `npm run deploy`.
- Verified the live header on `https://blu-crm.kurt-0f6.workers.dev/sign-in` with a cache-busted request: `permissions-policy: camera=(), microphone=(self), geolocation=()`, HTTP 200.

## Decisions Made

- **Root cause**: an empty allowlist `microphone=()` in `Permissions-Policy` disables `getUserMedia` for every origin, including the CRM's own pages. The browser blocked the microphone at the policy level before any user or OS permission was consulted. The voice button caught the resulting `NotAllowedError` and surfaced the misleading "blocked" message (the same catch branch also maps `NotFoundError` to that message).
- **Fix scope kept minimal and secure**: `microphone=(self)` allows the mic only on our own origin and still blocks it in cross-origin iframes. Camera and geolocation remain fully disabled (`()`), since neither is used. This preserves the intent of the 2026-07-05 hardening while unblocking the one capability the app actually needs.

## Issues Encountered

- Local dev returned a 500 mid-task from a wedged `next dev` process (editing `next.config.ts` while the server was running, plus stale wrangler/opennext processes). Resolved by restarting `next dev`. Not related to the header change.

## Next Steps

- Voice input still needs a real end-to-end manual test in-browser (record + Whisper transcription via `/api/chat/transcribe`) now that the policy-level block is removed. This fix confirms the header no longer blocks `getUserMedia`, but the full record-and-transcribe path has not yet been exercised end to end.
- Possible future UX improvement: `VoiceInputButton` lumps `NotFoundError` (no microphone present) in with `NotAllowedError` (permission denied) under the single "Microphone access is blocked" message, which is misleading. Distinguish the two so a missing-device case reports differently from a denied-permission case.

## Related Files

- `next.config.ts` (Permissions-Policy header changed)
- `src/components/ai/voice-input-button.tsx` (surfaces the error message; not modified)
- Commit `5498f42` on `main`; live version ID `dfe48545-54eb-47c8-9f2c-97031b1c326a`
