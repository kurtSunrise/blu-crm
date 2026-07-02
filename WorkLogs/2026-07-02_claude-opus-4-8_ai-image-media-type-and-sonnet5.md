# Work Log: Fix AI Assistant image media-type 400 + switch model to Sonnet 5

**Agent**: Claude Code (claude-opus-4-8)
**Session ID**: a7203935-a87f-4376-9718-6da8b5d5ae88
**Mode**: Implementation (plan-approved)
**Date**: 2026-07-02T00:00:00Z

## Task Description
On the deal-page AI Assistant, sending a message with an image attached failed with:
`Anthropic API error 400: ... The image was specified using the image/jpeg media type,
but the image appears to be a image/png image`. Fix and harden this, and switch the
assistant model to Sonnet 5.

## Actions Taken
- `src/lib/ai/attachments.ts`: added a magic-number sniffer (`detectImageMediaType`) plus
  `isImageContentType`, and reworked the private `toMediaBlock` to take the file's
  `ArrayBuffer`. It now sends the Anthropic `media_type` sniffed from the real bytes
  (PNG/JPEG/WebP/GIF), falling back to the stored contentType only when the magic number is
  unrecognised. Both call sites (`loadMediaBlocksById` for chat attachments,
  `loadDealAttachmentMedia` for deal-file vision/description) now pass the buffer directly, so
  the bytes are read once and reused for base64 + sniff — no extra R2 reads.
- `src/lib/ai/client.ts`: changed `DEFAULT_MODEL` from `claude-opus-4-8` to `claude-sonnet-5`.
  `AI_MODEL` is unset in prod, so the default is what runs; `getAiModel()` feeds both the
  streaming agent loop and the `describeMedia` vision call.

## Decisions Made
- Fixed at *send* time (in `toMediaBlock`) rather than at upload, because it is authoritative
  and also repairs attachments already stored in the DB/R2 with a wrong contentType — no
  migration or re-upload needed. Root cause was trusting the browser-declared MIME
  (`file.type`) captured at upload in `src/app/api/chat/attachments/route.ts`.
- Included `image/gif` (already valid in `Base64ImageSource` and accepted by Anthropic vision)
  in the sniffed set for robustness, even though uploads restrict to jpeg/png/webp/pdf.
- Model switch confirmed with the user via a clarifying question (Opus 4.8 is more capable;
  user chose Sonnet 5 anyway).

## Issues Encountered
- None. Root cause was clear once the upload path showed `contentType = file.type`.

## Verification
- `npm exec -- ultracite fix` + `check` on both files: clean.
- `npx tsc --noEmit`: exit 0, zero errors.
- Byte-sniffer logic exercised against real PNG/JPEG/WebP/GIF/junk headers (all correct) and
  the exact bug repro: PNG bytes stored as `image/jpeg` now send `media_type: image/png`.
- Not run: full `npm run build` and Playwright e2e (isolated server-side logic change,
  typecheck-clean). Recommend running the assistant e2e (mock Anthropic) before deploy, and a
  live smoke test attaching a mislabeled image on a deal page.

## Next Steps
- Deploy to production via local `npm run deploy` (Paid `0f665…`/`kurt-0f6` account — the only
  path to the live site).
- Optional follow-on (not done): also sniff-and-correct the stored contentType at upload in
  `src/app/api/chat/attachments/route.ts` and `src/app/api/attachments/route.ts` so R2
  `httpMetadata` and DB rows are honest going forward.

## Related Files
- `src/lib/ai/attachments.ts` (changed)
- `src/lib/ai/client.ts` (changed)
- `src/lib/ai/anthropic.ts` (`Base64ImageSource` type reused)
- `src/app/api/chat/attachments/route.ts` (root-cause context, unchanged)
