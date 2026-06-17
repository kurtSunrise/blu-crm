# Work Log: AI assistant access to deal Files and photos (vision + cached descriptions)

**Agent**: Claude Opus 4.8 (Claude Code)
**Session ID**: N/A
**Mode**: Feature implementation
**Date**: 2026-06-17

## Task Description

Give the AI assistant access to a deal's "Files and photos" (the `attachment`
table). Two layers, both requested by Kurt:
1. List & reference the files via get_deal.
2. View image contents (vision) on demand, with the result cached to the DB so
   the assistant can reference it cheaply afterwards.

Kurt also asked that the cache strategy be a configurable AI setting: lazy
(describe on first view) vs eager (describe in the background on upload), with
lazy as the default.

## Actions Taken

- **Schema**: added `aiDescription` (text) and `aiDescribedAt` (timestamp) to
  the `attachment` table; pushed with `npm run db:push`.
- **get_deal** (`src/lib/ai/tools/query-tools.ts`): now returns a `files` list
  (id, fileName, type, date, cached description), limited to 25, newest first.
- **view_deal_file tool** (`src/lib/ai/tools/file-tools.ts`, new): loads up to 3
  deal images from R2, returns the real images to the model for this turn, and
  on first view generates + caches a short vision description. Non-viewable
  types (Office docs) are reported as such.
- **Lean history**: `AiToolOutcome` gained an optional `media` field; the agent
  loop (`src/lib/ai/agent-loop.ts`) now produces two tool-result variants —
  `live` (carries the real image blocks, shown to the model) and `persisted`
  (text only, stored in chat history). So the model sees the image once, the DB
  stays lean, and replays reference the cached description instead of re-billing
  image tokens.
- **Shared media loader** (`src/lib/ai/attachments.ts`): exported
  `arrayBufferToBase64` and added `loadDealAttachmentMedia` (reads
  `attachment` rows + R2 bytes once, reused by the tool and the describer).
- **Describer** (`src/lib/ai/attachment-describe.ts`, new): `describeMedia`,
  `cacheAttachmentDescription`, `describeAttachmentsByIds`, plus the
  `attachment_description_mode` setting getter (default lazy).
- **Settings UI**: `attachmentDescriptionModeSchema` (validation/settings.ts),
  `updateAttachmentDescriptionMode` action (settings-actions.ts), a new
  `AttachmentDescriptionModeForm` (NativeSelect, lazy/eager), surfaced in a new
  "Deal file descriptions" panel on `/settings/ai`.
- **Eager mode**: the upload route (`src/app/api/attachments/route.ts`)
  schedules `describeAttachmentsByIds` via `ctx.waitUntil` when the setting is
  eager, so the upload response is not held up.
- **System prompt**: documented the deal files list + view_deal_file, steering
  the model to prefer cached descriptions and only view images when detail
  matters.

## Decisions Made

- Reused the existing R2 -> base64 path and the `attachment` table rather than a
  new store. Descriptions are plain text on the attachment row, queryable by
  get_deal.
- Persisted tool results store description text only; the live in-turn result
  carries the image. This honours the same lean-DB principle behind the
  `blu_media` rehydration used for chat uploads, without persisting base64.
- Vision/tool_result is limited to images (jpeg/png/webp). PDFs can be described
  but not shown inline (the Messages API does not accept document blocks in a
  tool_result); Office docs are neither described nor viewable yet.
- `view_deal_file` capped at 3 files per call to bound token + Worker-CPU cost.

## Issues Encountered

- TypeScript: the SDK's `ToolResultBlockParam` content type lists only text
  blocks, though the Messages API accepts image blocks in a tool_result. Cast
  the mixed live content to the param type (runtime is correct).
- Repo-wide `ultracite` still trips on the stray `.kilo/worktrees/
  rigorous-hallway/biome.jsonc`; linted the changed files directly (clean).

## Verification

- `npm exec -- ultracite fix` on changed files: clean.
- `npm run db:push`: applied.
- `npm run build`: succeeded.
- Manual end-to-end (assistant viewing a real deal photo, and the eager path)
  not yet exercised by a human; recommend a quick check on `kurt-0f6` after
  deploy.

## Next Steps

- Deploy: `npm run deploy` (local, Paid `0f665…`/`kurt-0f6` only — see
  [[blu-crm-deployment-split-brain]] equivalent note in PRD §10). The new
  columns are already on the shared Neon DB.
- Manually verify: ask the assistant "what do the photos on this deal show?"
  and confirm it views + describes, then re-asks cheaply on the next turn.
- Optional: extend vision to PDFs by returning the document in a follow-up user
  turn rather than the tool_result; add Office-doc text extraction.

## Related Files

- `src/db/schema.ts`
- `src/lib/ai/attachments.ts`
- `src/lib/ai/attachment-describe.ts` (new)
- `src/lib/ai/tools/file-tools.ts` (new)
- `src/lib/ai/tools/types.ts`, `src/lib/ai/tools/index.ts`
- `src/lib/ai/agent-loop.ts`
- `src/lib/ai/tools/query-tools.ts`
- `src/lib/ai/system-prompt.ts`
- `src/lib/validation/settings.ts`, `src/lib/actions/settings-actions.ts`
- `src/components/attachment-description-mode-form.tsx` (new)
- `src/app/(app)/settings/ai/page.tsx`
- `src/app/api/attachments/route.ts`
