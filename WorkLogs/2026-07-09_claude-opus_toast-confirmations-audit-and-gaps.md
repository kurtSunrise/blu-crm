# Work Log: Toast confirmations — platform audit and gap closure

**Agent**: Claude Opus 4.8 (1M context)
**Session ID**: N/A
**Mode**: Plan then implement (crm-ui / data-layer surface)
**Date**: 2026-07-09T00:00:00+08:00

## Task Description
Started as "on /tasks, when an item is cleared can we get a toast?" — that already existed (`complete-follow-up-button.tsx`). Kurt redirected to a platform-wide analysis of where else toast confirmations would help, then chose to implement Tier 1 (silent-failure gaps) plus the redirecting create/edit forms, and to update the help "What's new" section.

## Actions Taken
- Audited every mutating client component for toast coverage (three parallel Explore passes). ~15 already toast; ~18 did not.
- Tier 1 gaps (silent failure / destructive), added success+error toasts matching the existing `stage-select.tsx` / `complete-follow-up-button.tsx` pattern:
  - `inbox-triage.tsx` — assign owner, discard lead.
  - `pipeline-board.tsx` — error toast on rejected move (success omitted; the card already animates).
  - `ai/thread-history.tsx` — error toasts on rename/pin/delete, success toast on delete.
  - `archive-record-button.tsx` — error toast when the action resolves without redirecting (uses `unstable_rethrow` to let the success redirect through).
- Redirecting create/edit forms: new `toast-flash.tsx` (reads `?flash=<key>`, toasts once, strips the param) mounted in `(app)/layout.tsx` inside `<Suspense>`; server actions append the flash key to their redirect targets; forms gained `toast.error` via a `useEffect` on `state.error` (inline `role="alert"` kept for a11y).
- Fixed a latent bug: `archiveCompany` redirected to `/contacts`; now `/companies?flash=company-archived`.
- Added a "What's new" item under 09/07/2026 in `help/page.tsx`.

## Decisions Made
- **Redirect footgun**: `redirect()` throws `NEXT_REDIRECT`, so a post-`await` success toast never runs on redirecting actions and a naive try/catch swallows the redirect. Success for those flows is confirmed on the destination via the flash param; the archive button rethrows framework errors with `unstable_rethrow`.
- **Board success toast omitted** by design — the optimistic card move is the confirmation; toasting every drag during triage would be noise. Failure still toasts.
- **Settings inline "Saved." forms left as-is** (~10 files) — internally consistent; deferred to a later consistency sweep (Kurt chose Tier 1 + forms only).

## Issues Encountered
- None blocking. Confirmed `waitForURL("**/pipeline")` still matches after the flash strip returns the URL to `/pipeline` (targeted e2e passed).

## Verification
- `npm exec -- ultracite check` — clean (372 files).
- `npm run build` — pass.
- `npx opennextjs-cloudflare build` — pass (footgun clear; only an unrelated third-party duplicate-key warning).
- `npx playwright test e2e/pipeline.spec.ts --project=desktop -g "quick-add captures a lead"` — pass.
- Not yet done: full e2e suite; local `npm run preview` browser smoke; production deploy.

## Next Steps
- Optional: `npm run preview` and click through inbox assign/discard, contact/company create+edit+archive, and assistant thread rename/pin/delete before deploy.
- Deploy via local `npm run deploy` (only path to prod).
- Later: consider the Tier 3 settings-form consistency sweep.

## Related Files
- New: `src/components/toast-flash.tsx`
- `src/app/(app)/layout.tsx`
- `src/components/inbox-triage.tsx`, `pipeline-board.tsx`, `ai/thread-history.tsx`, `archive-record-button.tsx`
- `src/components/quick-add-form.tsx`, `contact-form.tsx`, `contact-edit-form.tsx`, `company-edit-form.tsx`
- `src/lib/actions/deal-actions.ts`, `contact-actions.ts`, `company-actions.ts`
- `src/app/(app)/help/page.tsx`
