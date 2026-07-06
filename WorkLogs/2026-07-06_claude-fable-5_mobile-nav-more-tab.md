# Work Log: Mobile Navigation Parity ("More" tab on phone bottom bar)

**Agent**: claude-fable-5
**Session ID**: 1d17b702-15d4-47bb-822a-071c964830e1
**Mode**: Implementation (user chose the design from an options question)
**Date**: 2026-07-06T00:00:00+08:00 (approximate)

## Task Description

On desktop the sidebar exposes Dashboard, Pipeline, Calendar, Inbox, Tasks,
Quick add, Contacts, and Reports, but the mobile bottom tab bar only had
Pipeline, Calendar, Inbox, Tasks, and Quick add. Contacts and Reports had no
mobile nav entry at all; they were only reachable via tiny footer text links
on the dashboard (`src/app/(app)/page.tsx` footer). Companies is a view
inside the Contacts directory, so Contacts covers it. This work adds a sixth
"More" tab to the phone bottom bar so every primary destination is reachable
from mobile nav.

## Actions Taken

- `src/components/app-shell.tsx`: added `MOBILE_MORE_HREFS` /
  `MOBILE_MORE_NAV` (filtered from `PRIMARY_NAV` so labels and icons stay
  single-sourced) and a sixth bottom-bar tab rendering a `DropdownMenu`
  (existing `ui/dropdown-menu`, Base UI) with `side="top"` `align="end"`
  containing Dashboard, Contacts, and Reports as real links
  (`render={<Link .../>}` pattern, `aria-current` on the active item).
- The trigger uses the `Ellipsis` lucide icon, matches the other tabs'
  styling (`min-h-14`, `text-xs`), and highlights `text-blu` when any of its
  destinations is active via the existing `isActivePath` helper.
- Rewrote the stale comment that claimed Reports/Contacts were "reachable
  from the dashboard on phones".
- New `e2e/mobile-nav.spec.ts` (phone-only via `test.skip` on viewport width
  >= 768): one spec asserts the five original tabs plus More are present;
  another opens the More menu and navigates to Contacts and Reports,
  asserting URLs and headings.
- No other surfaces changed.

## Verification

- `npm exec -- ultracite check` clean; `npm run build` passes.
- Phone project runs of `mobile-nav.spec.ts`, `smoke.spec.ts`, and
  `auth.spec.ts` all pass. `mobile-nav.spec.ts` correctly skips on desktop.
- Visually verified at Pixel 7 size via Playwright screenshots: the menu
  opens upward above the tab bar, and the active highlight works on
  `/reports`.

## Decisions Made

- Sixth "More" bottom tab over header icons or a hamburger menu: presented
  as an options question; the user chose the More tab.
- Derived `MOBILE_MORE_NAV` by filtering `PRIMARY_NAV` rather than declaring
  a parallel list, so labels, hrefs, and icons stay single-sourced between
  the sidebar and the mobile menu.
- Reused the existing Base UI `DropdownMenu` rather than a custom sheet;
  `render={<Link .../>}` keeps items as real navigations.

## Issues Encountered

- `e2e/auth.spec.ts` needs `SEED_USER_PASSWORD` exported in the shell: it
  reads `process.env` directly, unlike global-setup which parses
  `.env.local`. The value in `.env.local` is quoted, so
  `export $(grep ...)` mangles it; use
  `eval "$(grep '^SEED_USER_PASSWORD=' .env.local)"` instead.
- A pre-existing hydration warning from the AI assistant textarea
  (caret-color style) shows in the Next dev overlay; unrelated to this
  change.

## Next Steps

- Changes are uncommitted on `main`, pending user review; commit after
  approval.
- No deploy done or needed as a blocker (UI-only change, no schema or
  wrangler changes); ship via `npm run deploy` whenever the user wants it
  live.

## Related Files

- `src/components/app-shell.tsx`
- `e2e/mobile-nav.spec.ts` (new)
- `src/app/(app)/page.tsx` (dashboard footer links, referenced only)
- Related: `2026-07-03_claude-fable-5_header-navigation-unification.md`
  (prior app-shell nav work, `isActivePath`)
