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

## Follow-up: error 1102 (Worker CPU limit) on attachment rehydration

**Date**: 2026-06-16T (same session, later)

- **Symptom**: a logged-in session stuck on Cloudflare error 1102; incognito was
  fine. The session was auto-resuming a thread whose `POST /api/chat` turn
  rehydrates attachments, and that turn tripped the per-request CPU limit.
- **Root cause**: `loadMediaBlocksById` (`src/lib/ai/attachments.ts`) read each
  R2 object sequentially and base64-encodes every file synchronously. The
  synchronous base64 of several large files is the actual CPU cost.
- **Fix**:
  - Parallelised the R2 fetches via `Promise.all` (was a sequential
    `for…await` loop) — cuts wall-clock latency of the rehydration step.
  - Raised the Worker CPU ceiling to the 5-minute max
    (`limits.cpu_ms: 300000`) in `wrangler.jsonc` — the real lever for 1102,
    giving headroom for the synchronous base64 work.
- **Verified**: `ultracite check` clean, `npm run build` succeeds. Not yet
  deployed — user to run `npm run deploy`. E2E unchanged (backend perf only,
  no behaviour change); the same seed/auth block from the main task still
  applies.
- **Deeper optimisation if 1102 recurs**: the chunked base64 helper
  (`arrayBufferToBase64`) builds one large string via `+=`; could move bytes
  off the critical path (cache the encoded blob, or use the Anthropic Files API
  / most-recent-only rehydration noted in Next Steps).

## Follow-up: Workers Paid upgrade + quote price field crash

**Date**: 2026-06-16T (same session, later)

- **Plan**: account was on Workers Free, which rejects `limits.cpu_ms`
  (API code 100328) and caps CPU at ~10 ms — the true cause of the 1102. User
  upgraded to Workers Paid; the 5-min `cpu_ms` config now deploys and the
  default CPU ceiling is 30 s.
- **Quote price field**: user pasted a `$`-formatted amount into the quote
  value field and the page failed to load. The field was `type="number"`
  (`src/components/quote-form.tsx`), which silently rejects `$12,500.00`.
  - Switched it to `type="text"` + `inputMode="decimal"` (keeps the mobile
    numeric keypad) so a formatted paste is accepted.
  - Hardened `createQuoteSchema` (`src/lib/validation/quote.ts`) with a
    `z.preprocess` that strips `$`, commas, and whitespace before coercion.
    The AI `create_quote` tool uses its own `z.number()` schema and is
    unaffected.
- **Deployed** to `blu-crm` on Paid: version `841bc59b-0d18-475c-84b7-eb669f10c351`.
  This release also carries the parallelised R2 attachment reads and the
  `cpu_ms` ceiling.
- **Verified**: `ultracite check` clean on changed files, `npm run build`
  succeeds, `wrangler deploy` succeeded.

## Related Files

- `src/lib/ai/anthropic.ts`, `src/lib/ai/attachments.ts`, `src/lib/ai/threads.ts`,
  `src/lib/ai/system-prompt.ts`
- `src/app/api/chat/route.ts`, `src/app/api/chat/attachments/route.ts`,
  `src/app/api/chat/attachments/[id]/route.ts`
- `src/lib/validation/attachment.ts`, `src/db/schema.ts`
- `src/components/ai/chat-panel.tsx`, `src/components/ai/ai-context.tsx`,
  `src/components/ai/ai-runtime-provider.tsx`
- `e2e/ai-assistant.spec.ts`
