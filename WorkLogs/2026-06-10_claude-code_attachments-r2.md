# Work Log: Deal Attachments on R2 (FR-9) + Console Fix + Flake Fix

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: cse_01WsDKrW9UJW7aBbMFBca1nW
**Mode**: Implementation (autonomous)
**Date**: 2026-06-10T23:00:00+08:00
**Duration**: ~1.5 hours

## Task Description

Finish M3's last item: documents and photos on R2 (FR-9). Real bucket
credentials arrive tomorrow, but `initOpenNextCloudflareForDev()` provides a
simulated `PHOTO_BUCKET` binding locally, so the whole pipeline is built and
E2E-tested now; production only needs the existing bucket and a deploy.
Also fixed a Base UI console error the user hit and a Won/Lost E2E flake.

## Actions Taken

- **Upload** (`POST /api/attachments`): multipart file + dealId, validated
  (10 MB cap, photos/PDF/Office types only, sanitised file names), stored at
  `deals/{dealId}/{uuid}/{name}` via the `PHOTO_BUCKET` R2 binding
  (`getCloudflareContext()`), `attachment` row inserted, and an "Attached
  {file}" note on the deal timeline (FR-4.2).
- **Serving** (`GET /api/attachments/[id]`): streams the object with its
  content type, `Content-Disposition: inline`, private cache. Objects are
  never publicly listable; the app route is the only path to them, and it
  will inherit auth when route gating lands (FR-9's privacy requirement,
  with app-mediated access instead of presigned URLs in V1).
- **Deal page**: "Files and photos" section with image thumbnails (Next
  `Image` with `unoptimized`; the private route bypasses the optimiser) and
  file tiles, plus a single large "Add photo or file" control
  (`attachment-upload.tsx`) that opens the camera or picker on phones.
- **Types**: generated `cloudflare-env.d.ts` via `wrangler types
  --env-interface CloudflareEnv` and committed it (removed from .gitignore,
  with a regen note) so builds work straight after `git pull`.
- **Constitution corrections**: replaced stale Blu Shed values (worker
  `blushed`, bucket `blushed-photos`, `NEXT_PUBLIC_R2_PUBLIC_URL` base64
  fallback) with this repo's reality: worker `blu-crm`, bucket
  `blu-crm-photos`, private streaming route, simulated local binding.
- **Console fix**: `nativeButton={false}` on the contacts "Add contact"
  Button that renders a Link (Base UI semantics warning, reported by user).
- **E2E** (`e2e/attachments.spec.ts`): upload a PNG onto a deal, thumbnail
  renders, the private route returns 200 with `image/png`, timeline shows
  the note; rejection paths (no file, disallowed type) return 400.
- **Flake fix** (`won-lost.spec.ts`): the board updates optimistically, so
  navigating right after "Mark as won" could abort the stage-move POST
  before the server committed it (notification never created). Tests now
  wait for the action's POST response before navigating. Full suite passed
  twice consecutively: 81/81 on phone/tablet/desktop.

## Decisions Made

- **No public bucket URL**: PRD FR-9 wants private files; serving through
  the app keeps one access path and avoids presigned-URL plumbing until
  auth exists to scope it.
- **Local dev uses the miniflare-simulated binding** (persisted in
  `.wrangler/`), not a base64 fallback: same code path as production.
- The optimistic-update race the flake exposed also means a real user who
  closes the tab within ~a second of confirming Won could lose the move;
  acceptable for V1, noted for the auth/offline pass.

## Issues Encountered

- Two scripted JSX insertions into the deal page missed their anchor after
  formatter runs and failed silently; redone with verified anchors.
- Biome rejects raw `<img>`; switched to `next/image` with `unoptimized`.

## Next Steps

- Tomorrow: create/confirm the real `blu-crm-photos` bucket, then
  `npm run db:push:prod`, set `EMAIL_INTAKE_TOKEN` secret, and deploy; that
  brings production up to date with M1 through M3 (also fixes the stale
  404s the user saw on the worker).
- M4 AI assistant (artifact chat, tool layer over the shared validation
  paths); auth remains the prerequisite for per-user scoping and securing
  the attachment route.

## Related Files

- src/app/api/attachments/{route.ts,[id]/route.ts}
- src/components/attachment-upload.tsx, src/app/(app)/deals/[id]/page.tsx
- src/lib/validation/attachment.ts, cloudflare-env.d.ts, .gitignore
- src/app/(app)/contacts/page.tsx, e2e/{attachments,won-lost}.spec.ts
- WorkLogs/TEAM_CONSTITUTION.md
