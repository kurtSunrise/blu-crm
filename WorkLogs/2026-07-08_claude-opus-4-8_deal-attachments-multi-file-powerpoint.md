# Work Log: Multi-file upload + PowerPoint support for deal attachments

**Agent**: Claude Opus 4.8 (1M context)
**Session ID**: N/A
**Mode**: Plan then implement (crm-ui domain)
**Date**: 2026-07-08T00:00:00Z

## Task Description

On the deal page (`/deals/[id]`), the "Files and photos" section should support
uploading multiple files at once and accept documents like PowerPoint and PDF.
PDF was already supported; the real gaps were multi-file selection and PowerPoint.

## Actions Taken

- Added the two PowerPoint MIME types to `ALLOWED_ATTACHMENT_TYPES` in
  `src/lib/validation/attachment.ts` (`application/vnd.ms-powerpoint` and
  `application/vnd.openxmlformats-officedocument.presentationml.presentation`).
- Reworked `src/components/attachment-upload.tsx`: added `multiple` to the file
  input, extended `accept` with `.ppt,.pptx`, and changed `handleFiles` to loop
  over all selected files, uploading each sequentially via the existing
  single-file `POST /api/attachments`. Added a progress counter ("Uploading 2 of
  5…"), partial-failure handling ("2 added, 1 failed"), and count-aware success
  toasts. `router.refresh()` runs once at the end when any upload succeeded.
- Added e2e coverage in `e2e/attachments.spec.ts`: selects a PNG + a `.pptx` in
  one `setInputFiles` call and asserts the image thumbnail, the PowerPoint
  filename tile, and both timeline "Attached …" entries appear.

## Decisions Made

- **Kept the API route single-file per POST.** The client loops instead. This
  preserves per-file activity logging, per-file AI description, and the
  no-transaction-friendly write ordering the Neon HTTP driver requires. Client
  uploads sequentially to keep timeline order deterministic and avoid hammering
  the worker; already-uploaded files persist if a later one fails.
- **Left `AI_READABLE_TYPES` unchanged.** PowerPoint, like the already-allowed
  Word/Excel, is stored and downloadable but not readable by Claude vision.
- **Scoped to the deal-page uploader only.** The AI chat attachment uploader
  (`chat-launcher.tsx`, `/api/chat/attachments`) was intentionally untouched.

## Issues Encountered

- First e2e run under parallel workers failed the tablet (WebKit) project and one
  phone test on `goto`/locator timeouts. Rerunning with `--workers=1` passed all
  9 tests — the known tablet-WebKit parallel-goto flake, not a regression.

## Verification

- `npm exec -- ultracite check` — clean (one auto-format applied).
- `npm run build` — succeeded.
- `npm run test:e2e -- attachments --workers=1` — 9/9 passed (phone, tablet,
  desktop): existing single-photo, new multi-file + PowerPoint, and the
  reject-unsupported test.

## Next Steps

- Optional follow-up if wanted: mirror PowerPoint/multi-file in the AI chat
  uploader, or add server-side text extraction to make Office/PowerPoint files
  AI-readable.

## Related Files

- `src/lib/validation/attachment.ts`
- `src/components/attachment-upload.tsx`
- `e2e/attachments.spec.ts`
