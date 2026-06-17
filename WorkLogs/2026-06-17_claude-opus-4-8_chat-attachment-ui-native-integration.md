# Work Log: AI chat attachments now render in the conversation UI

**Agent**: Claude Opus 4.8 (claude-opus-4-8)
**Session ID**: N/A
**Mode**: Plan then implement (interactive)
**Date**: 2026-06-17T06:40:00Z
**Duration**: ~1 session

## Task Description

A user attached a PDF to the AI Assistant chat. The model read it fine, but
after sending there was no reference to the file anywhere in the chat UI — the
sent message bubble showed only the typed text, and a resumed thread showed at
most a stray "📎 filename" text fragment. Make attachments visible in the
conversation the way they appear while staging in the composer.

## Actions Taken

- Diagnosed that the backend path was already correct (upload → `blu_media`
  ref → rehydrated Anthropic `document`/`image` block; `system-prompt.ts:16`
  instructs the model to read attachments). The defect was UI-only: attachments
  lived in a custom context ref and were sent as `attachmentIds` in the request
  body, never attached to the assistant-ui message.
- Adopted assistant-ui 0.12's native attachment system end to end:
  - New `src/components/ai/chat-attachment-adapter.ts` — an `AttachmentAdapter`
    that uploads each file to the existing `/api/chat/attachments` route and
    carries the server `chat_attachment` id on `Attachment.id`. Validates the
    10 MB cap and AI-readable MIME types, surfacing failures through an
    `onError` callback (the runtime does not await `add()`, so a thrown error
    would otherwise be invisible).
  - `ai-runtime-provider.tsx` — wired the adapter via
    `useLocalRuntime(..., { adapters: { attachments } })`; the `run()` generator
    now reads `attachmentIds` off the sent user message instead of the ref.
    Extracted `lastUserTurn()` to keep `run()` under the cognitive-complexity
    limit.
  - `chat-panel.tsx` — composer now uses `ComposerPrimitive.AddAttachment` +
    `ComposerPrimitive.Attachments`; `UserMessage` renders
    `MessagePrimitive.Attachments`. One `AttachmentChip` (reads `useAttachment`)
    serves both the composer (with `AttachmentPrimitive.Remove`) and the
    read-only message bubble.
  - `ai-context.tsx` — removed the now-dead `attachmentsRef` /
    `pendingAttachments` / `UploadedAttachment` plumbing; added a single
    `attachmentError` channel for the composer.
  - `threads.ts` — `DisplayMessage` gained an `attachments[]` array rebuilt from
    the persisted `blu_media` refs; `displayTextFromContent` no longer injects
    the "📎" text; `loadThreadDisplayMessages` keeps a turn when it has text
    **or** attachments.
  - `chat-launcher.tsx` — `toThreadMessages` maps those attachments onto
    `ThreadMessageLike.attachments` (server id on `id`) so resumed bubbles
    rebuild real chips.
- Updated `e2e/ai-assistant.spec.ts`: the image test now drives the transient
  file input via the `filechooser` event (assistant-ui's AddAttachment creates
  the input on click) and asserts the chip persists on the sent bubble; added a
  test that a resumed thread still shows its attachment chip.

## Decisions Made

- **Carry the server id on `Attachment.id`.** It survives upload → message →
  resume with no side map, lets `run()` read ids straight off the message, and
  lets the chip fetch its thumbnail from `/api/chat/attachments/{id}` in both
  live and resumed states.
- **Dropped the "Uploading…" spinner.** assistant-ui only shows an attachment
  once `add()` resolves. Keeping a stable id across an async-generator upload
  risked duplicate chips (the composer upserts by id), so `add()` is a single
  Promise. Files ≤10 MB upload quickly; the minor loss of an in-flight spinner
  was the right trade for correctness. Validation errors still surface beneath
  the composer.

## Issues Encountered

- **E2E could not run in this environment.** Playwright global setup fails to
  sign in as `kurt@blu.builders` (HTTP 401) and asks for `npm run db:seed`.
  Per project memory the "local" dev DB is the shared remote Neon DB that the
  live Worker also uses, so seeding it could reset real team credentials — an
  outward-facing action I did not take unprompted. The new/updated specs are
  written and logically sound but remain unrun here. Handoff: set
  `SEED_USER_PASSWORD` / seed a test DB, then `npx playwright test ai-assistant`.
- `npm exec -- ultracite check` with no path args trips a pre-existing
  nested-biome-config error; per-file `ultracite fix`/`check` are clean.

## Verification

- `npm exec -- ultracite fix` on all changed files — clean.
- `npx tsc --noEmit` — no type errors.
- `npm run build` — succeeds; all chat routes compile.
- E2E — blocked on auth seeding (see above).

## Next Steps

- Run the Playwright `ai-assistant` spec once the DB/auth seed is available
  (ideally on the `phone` project too, per the mobile-first priority).
- Optional follow-up: restore an in-flight upload indicator if desired.

## Related Files

- `src/components/ai/chat-attachment-adapter.ts` (new)
- `src/components/ai/ai-runtime-provider.tsx`
- `src/components/ai/chat-panel.tsx`
- `src/components/ai/ai-context.tsx`
- `src/components/ai/chat-launcher.tsx`
- `src/lib/ai/threads.ts`
- `e2e/ai-assistant.spec.ts`
