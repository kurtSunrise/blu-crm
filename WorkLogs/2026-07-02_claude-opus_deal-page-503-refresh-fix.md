# Work Log: Deal page updates now appear without a manual reload

**Agent**: Claude Opus 4.8 (Claude Code)
**Session ID**: 02193f05-5964-4ad9-896c-bac9a3c33717
**Mode**: Diagnosis + fix (plan-then-implement)
**Date**: 2026-07-02T09:55:00+08:00

## Task Description
Adding a note or photo on `/deals/[id]` did not show up until a full manual browser
reload on the live Cloudflare site. Goal: updates appear in place, plus a success toast.

## Investigation (what it was NOT)
The client already called `router.refresh()` and the server action called
`revalidatePath`; the page is `force-dynamic`. Ruled out, with evidence:
- **Browser cache**: app routes already return `Cache-Control: no-cache, must-revalidate`;
  a `proxy`/middleware cannot override Cache-Control on dynamic RSC responses (verified in
  dev: custom header propagated, `Cache-Control` was reset by Next).
- **`revalidatePath` throwing (missing tag cache)**: tested on the workerd runtime via a
  throwaway route under `npm run preview` — returned `{ok:true,threw:false}`.
- OpenNext docs: SSR/`force-dynamic` routes are fresh out of the box.

## Root cause (confirmed on the live worker)
Observed live with the browser + `wrangler tail`:
- The note server-action `POST /deals/[id]` returned **503** (consistently, warm and cold);
  the DB write still landed (note visible after reload), so the client refresh never showed it.
- The `?_rsc` refresh GET also 503'd intermittently. `wrangler tail` captured **no logs** for
  the 503s → the runtime was terminating the request (resource/time limits), not app code.

Why the render is fragile on workerd:
1. `src/app/(app)/layout.tsx` calls `requireSession()` on every render (the documented,
   un-root-caused workerd `getSession` hang path — see constitution "Known Runtime Issues").
2. `deals/[id]/page.tsx` issued ~10 **sequential** Neon HTTP round-trips per render, and the
   server-action response re-renders the whole page — pushing it past the worker's limits.

## Actions Taken
- **Parallelized** the deal page's independent reads (sub-status batch, stages, users,
  follow-ups, quotes, attachments, timeline) into one `Promise.all` wave after the initial
  `record` fetch. Main render-time fix. (`src/app/(app)/deals/[id]/page.tsx`)
- Added `sonner` + a theme-aware `<Toaster>` (`src/components/ui/sonner.tsx`, mounted in
  `src/app/layout.tsx`).
- Success/error toasts on note add, photo upload, and attachment delete.
- Wrapped the note action in try/catch so a failed save surfaces a toast instead of a stuck
  "Adding…" spinner. (`src/components/note-composer.tsx`)
- Added the missing `revalidatePath` to the attachment POST/DELETE route handlers.

Committed as `7834f72` on `main`; deployed to prod via `npm run deploy`
(Paid `kurt-0f6`, Version `47ae0b4a`).

## Verification
Live, authenticated, cache-busted: added two notes back-to-back; **both appeared at the top
of the timeline in place with no reload** (2/2), textarea cleared, button reset. Before the
deploy the same action left the button stuck on "Adding…" and nothing appeared.

## Issues Encountered / Open
- The Chrome network panel reported stale/duplicate `503` + identical `_rsc` hashes on every
  read; unreliable. Trust the DOM — it updated correctly.
- The underlying `getSession`/workerd fragility is only mitigated (render is now much faster),
  not root-caused. If 503s recur under load, next step is instrumenting `requireSession`
  (`src/lib/session.ts` → `src/lib/auth.ts`). Consider `limits.cpu_ms` only as headroom.
- Other `force-dynamic` pages may still issue sequential queries; worth a sweep (see the prior
  `2026-06-10_..._perf-parallel-queries-and-neon-connect-fix.md`).

## Cleanup (done)
5 diagnostic notes ("...safe to delete") were added to deal BLU-2026-933 during live testing.
After the user authorized removal, they were deleted from the prod DB (ep-snowy-rain) via a
dry-run SELECT → exact-match DELETE (`deal_id=… and type='note' and content like
'%(safe to delete)%'`), 5 matched and removed, 0 remaining. Throwaway script deleted.

## Related Files
- `src/app/(app)/deals/[id]/page.tsx`
- `src/app/(app)/layout.tsx`, `src/lib/session.ts` (getSession path — open)
- `src/components/note-composer.tsx`, `src/components/attachment-upload.tsx`,
  `src/components/attachment-delete-button.tsx`
- `src/components/ui/sonner.tsx`, `src/app/layout.tsx`
- `src/app/api/attachments/route.ts`, `src/app/api/attachments/[id]/route.ts`
