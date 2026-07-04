# Work Log: Header and Navigation Unification (deal-family pages)

**Agent**: claude-fable-5
**Session ID**: 3d42909c-16c2-4fb3-85d2-2292b011df93
**Mode**: Implementation (user-approved proposal after a header audit)
**Date**: 2026-07-03T12:05:00+08:00 (approximate)

## Task Description

Kurt flagged that header navigation across the deal-related pages felt
"disconnected and not consistent". An audit confirmed ten concrete
inconsistencies: three different back-link behaviours, five different page
widths, two pages without a semantic header element, no nav highlight on deal
detail, and no connective sub-nav for the pipeline family. This work unifies
them.

## Actions Taken

- New `src/components/page-header.tsx`: the single header contract (optional
  left-aligned arrow back link above the title, optional eyebrow, title,
  subtitle, actions slot on the right, children below for badge rows).
- New `src/components/pill-nav.tsx`: generic pill sub-nav extracted from the
  reports nav. `src/components/reports/reports-nav.tsx` is now a thin wrapper
  (with `active` optional so non-pill family pages can render the rail), and
  new `src/components/pipeline-nav.tsx` gives the pipeline family Board /
  Closed pills.
- Pages converted to PageHeader: pipeline board, closed deals, deal detail,
  quick add, inbox, and all seven report pages (overview, trends, funnel,
  team, weekly, daily, drill-down). The one-off "Closed deals" /
  "Back to pipeline" text links are gone, replaced by the pills; the
  /reports/deals drill-down now shows the reports pill rail (no active pill).
- Deal detail gained a "Back to pipeline" back link and keeps its lead-ID
  eyebrow and badge row via the new slots.
- `src/components/app-shell.tsx` `isActivePath`: viewing `/deals/[id]` now
  highlights Pipeline in the sidebar/tab bar (previously nothing was
  highlighted); Quick add keeps `/deals/new`.
- Vertical padding normalised to `py-6` on the pipeline pages (the last
  `py-4` holdouts). Widths deliberately left per-family (board pages need the
  wide fixed container; quick add stays intentionally narrow).

## Verification

- Typecheck and ultracite clean on all touched files.
- E2E: two runs produced mass ~30-40s `page.goto` timeouts with zero selector
  failures; both coincided with concurrent Claude sessions running Playwright
  against the shared dev server / e2e DB (one of them a DIFFERENT repo,
  /Users/user/Sites/blu, whose webServer squatted port 3000; plus a wedged
  leftover next-dev instance that Next 16's single-instance lock then blamed).
  Environmental, not product.
- Quiet-environment run: 16/17 passed across pipeline, closed-deals, and
  reports-analytics specs. The single failure was pre-existing test fragility:
  the Won-column toggle pattern `/Won/` also matches a card's "Move Closed
  Won ... to another stage" button once the column expands (strict-mode
  violation with closed-deals test data present). Anchored to `/^Won \d+$/`;
  retry green.
- Deployed version d0bb5927; live checks: /pipeline and /deals/new 307 for
  signed-out, /sign-in 200.

## Decisions Made

- Funnel-style pill rail over breadcrumbs: the reports family had already
  proven the pattern, and phones favour pills over a breadcrumb trail.
- Deal detail's back link is a static "Back to pipeline" rather than
  referrer-sniffing; predictable beats clever on a phone, and the sidebar
  highlight now shows context anyway.
- The deploy necessarily carries the concurrent contacts-session's
  work-in-progress from the shared tree; that session had itself deployed
  from the same tree minutes after the Phase 4 deploy (active deployment was
  already theirs, bac17c67), so this does not change the operating model.

## Issues Encountered

- Concurrency with two other active sessions was the whole story of
  verification (see above). Coordination lesson recorded: check
  `pgrep -fl playwright` and WHICH repo owns the processes before running
  e2e, and never `pkill` by pattern in this environment; kill only exact PIDs
  you started.

## Next Steps

- If /pipeline/closed grows filters, its header can take them as PageHeader
  children like the report pages do.
- Consider a shared width token if the per-family width split ever bothers
  anyone in practice.

## Related Files

- `src/components/page-header.tsx` (new)
- `src/components/pill-nav.tsx` (new)
- `src/components/pipeline-nav.tsx` (new)
- `src/components/reports/reports-nav.tsx`
- `src/components/app-shell.tsx`
- `src/app/(app)/pipeline/page.tsx`, `src/app/(app)/pipeline/closed/page.tsx`
- `src/app/(app)/deals/[id]/page.tsx`, `src/app/(app)/deals/new/page.tsx`
- `src/app/(app)/inbox/page.tsx`
- `src/app/(app)/reports/{page,trends/page,funnel/page,team/page,weekly/page,daily/page,deals/page}.tsx`
- `e2e/pipeline.spec.ts` (anchored Won toggle pattern)
- Related: `2026-07-02_claude-fable-5_reports-best-in-class-phase1-2.md`
