# Work Log: Fix long deal notes silently failing to save

**Agent**: Claude Code (claude-opus-4-8)
**Session ID**: 061f03e3-883a-4c20-9b20-bdee8da0f296
**Mode**: Plan → Implement
**Date**: 2026-06-30T00:00:00+08:00

## Task Description
A ~2197-character note pasted onto a deal page (`/deals/<id>`) did not save and
showed no error. Diagnose and fix.

## Root Cause
Two compounding bugs:
1. **Length cap too low.** `logActivitySchema.content` reused the shared
   `optionalTrimmed` schema (`src/lib/validation/deal.ts`), capped at `.max(2000)`.
   The note was 2197 chars, so `logQuickActivity` failed validation and returned
   `{ error: "Invalid activity" }` without inserting. The DB column
   `activity.content` is unbounded `text`, so the 2000 cap was arbitrary.
2. **Silent failure.** `NoteComposer` ignored the returned `ActionState`: it
   cleared the textarea and refreshed regardless, so a rejected note vanished with
   no message.

## Actions Taken
- Added a dedicated `longOptionalText` schema (max 20,000) in
  `src/lib/validation/deal.ts` and used it for `logActivitySchema.content`. Left
  the shared `optionalTrimmed` (short fields) and `setDealSubStatusSchema.note`
  unchanged.
- `logQuickActivity` now returns the actual Zod issue message instead of the
  generic "Invalid activity" (`src/lib/actions/deal-actions.ts`).
- `NoteComposer` now captures the action result, renders a `<p role="alert">`
  destructive error on failure, and keeps the typed note in place (does not clear)
  so the user does not lose their text.
- Added `e2e/deal-note.spec.ts`: creates a deal, opens it, submits a >2000-char
  note, asserts it appears in the timeline, the field clears, and no error shows.

## Decisions Made
- Cap chosen at 20,000 chars — generous (~10× the failing note), still a sanity
  bound. Easy to change.
- Did not widen the shared `optionalTrimmed`, to avoid loosening short contact /
  scope fields.
- E2E alert assertion scoped to `p[role="alert"]` because Next's route announcer
  is an always-present `div[role="alert"]`.

## Issues Encountered
- First e2e run failed only on a generic `getByRole("alert")` check colliding with
  Next's route announcer; core assertions (note saved, field cleared) passed.
  Fixed by scoping the locator.

## Verification
- `npm exec -- ultracite check` on all 4 changed files — clean.
- `npm run build` — succeeded.
- `npx playwright test deal-note.spec.ts` — 3/3 passing (phone, tablet, desktop).

## Next Steps
- The original note was never persisted to prod; it needs re-entering after this
  ships. Deploy is local-only via `npm run deploy` (Paid `0f665…` account).
- Optional follow-up: `QuickLogButtons` also ignores its action error (it sends no
  user content so it can't hit the cap) — left as-is.

## Related Files
- `src/lib/validation/deal.ts`
- `src/lib/actions/deal-actions.ts`
- `src/components/note-composer.tsx`
- `e2e/deal-note.spec.ts`
