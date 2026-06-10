# Work Log: Light Mode + In-App Help Area

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: cse_01WsDKrW9UJW7aBbMFBca1nW
**Mode**: Implementation (autonomous)
**Date**: 2026-06-10T21:30:00+08:00
**Duration**: ~45 minutes

## Task Description

User requests: light mode was missing (the root layout hard-coded the
`dark` class even though the Blu Shed-shared light tokens already existed
in globals.css), and a help documentation area modelled on Blu Shed's
/help should be bumped in priority. Also investigated reported 404s on
/inbox and /settings.

## Actions Taken

- **404 investigation**: /inbox and /settings exist on current main, are in
  the build route list, and are E2E-covered. The user's 404s predate the
  M2/M3 merges (stale localhost or the un-redeployed worker). No code
  change; redeploy of the worker plus `npm run db:push:prod` still pending.
- **Light mode**: added `next-themes` (class strategy, system default,
  light/dark toggle). Removed the hard-coded `dark` class;
  `suppressHydrationWarning` on `<html>`. `ThemeToggle` sits in the sidebar
  footer (labelled) and the mobile header (icon). New `BrandMark` component
  swaps logo-light.png/logo-dark.png with the scheme; replaced all four
  hard-coded logo usages (shell, home, /enquire, /q).
- **Help area** (`/help`, in the app shell): follows the Blu Shed help
  pattern: contents nav with anchors, ten task-oriented sections (getting
  started, capture, inbox triage, pipeline + won/lost, follow-ups, alerts,
  quotes, contacts/duplicates, notifications, settings with an Admin badge),
  expandable FAQ (native details/summary), glossary, "What's new" dated
  changelog, and a contact footer. Added to the sidebar secondary nav and
  the home module grid.
- **E2E** (`e2e/help-and-theme.spec.ts`): help contents anchor jump, FAQ
  expansion, glossary; theme toggle flips the `dark` class on `<html>` and
  back, from whatever scheme the device starts in. 75/75 across
  phone/tablet/desktop; lint, tsc, build clean. Verified light mode
  visually at 1440x900.

## Decisions Made

- Default theme is **system** rather than forced dark: the PRD's design
  direction names the dark theme but the team asked for light mode, and
  both palettes already ship in globals.css from the Blu Shed family.
- Public pages (/enquire, /q) inherit the visitor's system scheme with no
  toggle; client-facing surfaces should not carry app chrome.
- Help content lives as typed data + JSX in the page, not markdown files:
  no new dependency, and the content is small enough to review in one file.

## Issues Encountered

- Local Postgres stops between sessions in this container; restarted before
  the suite (same as previous turns).

## Next Steps

- R2 documents/photos when bucket credentials arrive (tomorrow).
- Redeploy the worker + `npm run db:push:prod` so production picks up
  M2/M3 routes (fixes the 404s the user saw if they were on the deployed
  site); `EMAIL_INTAKE_TOKEN` as a Wrangler secret.
- Keep the help "What's new" section updated per milestone (M4, M5).
- M4 AI assistant; auth.

## Related Files

- src/app/layout.tsx, src/components/{theme-provider,theme-toggle,brand-mark,app-shell}.tsx
- src/app/(app)/help/page.tsx, src/app/(app)/page.tsx
- src/app/(public)/{enquire/page.tsx,q/[token]/page.tsx}
- e2e/help-and-theme.spec.ts, package.json (next-themes)
