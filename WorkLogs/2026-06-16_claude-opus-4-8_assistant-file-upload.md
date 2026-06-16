# Work Log: File upload (images + PDF) for the AI Assistant

**Agent**: Claude Opus 4.8 (Claude Code)
**Session ID**: N/A
**Mode**: Plan then implement
**Date**: 2026-06-16T00:36:00Z

## Task Description

Let the AI Assistant accept file attachments so it answers and captures leads
with real context. Scope (confirmed with the user): images and PDFs first —
the formats Claude reads natively. Word/Excel deferred (need text extraction,
risks the 3 MiB Worker limit); HEIC excluded (Anthropic vision rejects it).

## Actions Taken

- Vendored `ImageBlockParam` / `DocumentBlockParam` (+ base64 source types)
  into `src/lib/ai/anthropic.ts` and added them to `ContentBlockParam`.
- Added `AI_READABLE_TYPES` (jpeg/png/webp/pdf) to
  `src/lib/validation/attachment.ts`; left the deal-attachment set untouched.
- Added the `chat_attachment` table to `src/db/schema.ts` (nullable threadId so
  a file can be uploaded before the first message creates the thread). Pushed
  with `npm run db:push` — additive CREATE TABLE, applied cleanly.
- New routes: `POST /api/chat/attachments` (upload to R2 `PHOTO_BUCKET`, scoped
  to `AI_READABLE_TYPES`, 10 MB cap) and `GET /api/chat/attachments/[id]`
  (private streaming for composer thumbnails), mirroring the deal routes.
- New `src/lib/ai/attachments.ts`: persists lightweight `blu_media` reference
  blocks on the user turn; `rehydrateMediaInMessages` swaps them for base64
  image/document blocks (bytes from R2) when the history goes to the model,
  prompt-caching the most recent block.
- Wired `src/app/api/chat/route.ts` (accept `attachmentIds`, persist refs, link
  files to the thread) and `src/lib/ai/threads.ts` (rehydrate in
  `loadThreadMessages`; show `📎 fileName` in the resumed transcript).
- Composer UI (`src/components/ai/chat-panel.tsx`): paperclip picker, staged
  chips with thumbnails + remove, uploading spinner, client-side type/size
  guard. State + adapter wiring via `attachmentsRef`/`pendingAttachments` in
  `src/components/ai/ai-context.tsx` and `ai-runtime-provider.tsx`, mirroring
  the existing `decisionRef` pattern.
- One line added to `src/lib/ai/system-prompt.ts` about reading attachments.
- E2E (`e2e/ai-assistant.spec.ts`): upload → chip → `attachmentIds` in the
  `/api/chat` request → cleared after send; plus an upload-rejection API test.

## Decisions Made

- **Store a reference, rehydrate at send (not base64 in Postgres).** Keeps
  `chat_message.content` lean and the transcript code simple; R2 stays the
  single source of bytes. Cost trade-off (re-sending media each turn it is in
  the replay window) is documented in the plan; mitigated within a turn by
  `cache_control: ephemeral` on the most recent media block.
- **Hand-rolled composer attachments over assistant-ui's attachment adapter**,
  to match the project's existing custom adapter + ref pattern.
- **`blu_media` is deliberately not in the Anthropic union**, so scans cast to
  `unknown` to let the type guard narrow (avoids a `never` collapse).

## Issues Encountered

- **E2E blocked at global setup**: sign-in as `kurt@blu.builders` returns 401
  ("Invalid password") before any test body runs — a seed/auth state issue on
  the shared Neon DB, independent of this change. Did NOT run `npm run db:seed`
  because the user's other session is live on the same DB. Tests are written
  and lint-clean; they need a working e2e auth/seed state to execute.
- Verified instead via `npx tsc --noEmit` (clean), `ultracite check` (clean),
  and `npm run build` (succeeds; both new routes registered).

## Next Steps

- Resolve the e2e sign-in/seed state, then run
  `npx playwright test e2e/ai-assistant.spec.ts` on phone + tablet.
- Manual check: attach a JPG and a PDF in the assistant, ask about them, confirm
  the reply uses their content; reload the thread and confirm the chip + context
  survive; confirm `chat_message.content` stores `blu_media` refs, not base64.
- Follow-up features: Word/Excel text extraction; Files-API or most-recent-only
  rehydration to cut multi-turn token cost.

## Related Files

- `src/lib/ai/anthropic.ts`, `src/lib/ai/attachments.ts`, `src/lib/ai/threads.ts`,
  `src/lib/ai/system-prompt.ts`
- `src/app/api/chat/route.ts`, `src/app/api/chat/attachments/route.ts`,
  `src/app/api/chat/attachments/[id]/route.ts`
- `src/lib/validation/attachment.ts`, `src/db/schema.ts`
- `src/components/ai/chat-panel.tsx`, `src/components/ai/ai-context.tsx`,
  `src/components/ai/ai-runtime-provider.tsx`
- `e2e/ai-assistant.spec.ts`
