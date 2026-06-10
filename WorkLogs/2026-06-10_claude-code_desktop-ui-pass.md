# Work Log: Desktop UI Best-Practice Pass

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: cse_01WsDKrW9UJW7aBbMFBca1nW
**Mode**: Implementation (autonomous)
**Date**: 2026-06-10T20:30:00+08:00
**Duration**: ~40 minutes

## Task Description

User feedback: the desktop UI was not following best practice. The app was
serving the phone layout at every width: bottom tab bar on large screens,
narrow single-column pages with dead space, no persistent navigation.
Mobile-first stays the priority (PRD §9.2) but desktop gets proper patterns.

## Actions Taken

- **App shell** (`app-shell.tsx`): persistent left sidebar at `md+` with
  brand, primary nav (Dashboard, Pipeline, Inbox, Tasks, Quick add,
  Contacts) and secondary nav (Notifications, Settings); active state with
  `aria-current="page"`. Sticky header and bottom tab bar are now
  mobile-only (`md:hidden`); content offsets with `md:pl-60`. Added a
  skip-to-content link.
- **Deal page**: `lg:` two-column grid, record/stage/quick-log/follow-ups/
  quotes on the left, timeline in a card alongside on the right; container
  widens to `lg:max-w-6xl`.
- **Tasks page**: `lg:` two-column, day list (Overdue/Today/Upcoming) left,
  Needs attention/Closing soon right; `lg:max-w-5xl`.
- **Contacts**: people grid (2-up where wide) beside companies, `lg:max-w-5xl`.
- **Home**: module grid goes 3-up at `lg`.
- **Inbox / Notifications**: modest widening to `lg:max-w-3xl` (single-list
  pages keep a readable measure).
- Forms (quick-add, contact, enquiry, settings) intentionally stay narrow.
- Verified with 1440x900 screenshots (home, pipeline, deal, tasks);
  69/69 E2E pass (the tablet project at 834px now exercises the sidebar),
  ultracite + tsc + build clean.

## Decisions Made

- Sidebar over a top nav bar: the app has 8 destinations and a kanban that
  wants horizontal room; a fixed 240px sidebar is the standard density
  trade-off for desktop web apps.
- Bottom tabs removed at `md+` because they are a thumb-reach pattern;
  hidden via CSS so the a11y tree never exposes two primary navs at once.
- Reading-width pages (inbox, notifications, forms) deliberately do not
  stretch: long line lengths are the anti-pattern, not the narrowness.

## Issues Encountered

- None of note; existing E2E locators were already role/section-scoped so
  the second nav did not introduce strict-mode collisions.

## Next Steps

- R2 documents/photos (user confirms credentials tomorrow) completes M3.
- M4 AI assistant; auth remains the standing prerequisite for per-user
  scoping.
- Possible polish: unread badge on the sidebar Notifications item; sidebar
  collapse at `md` widths if 240px feels tight on small laptops.

## Related Files

- src/components/app-shell.tsx
- src/app/(app)/{page,deals/[id]/page,tasks/page,contacts/page,inbox/page,notifications/page}.tsx
