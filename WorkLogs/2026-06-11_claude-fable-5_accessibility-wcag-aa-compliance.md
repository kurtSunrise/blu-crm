# Work Log: Site-wide WCAG 2.1 A/AA accessibility scan and fixes

**Agent**: Claude Code (claude-fable-5)
**Session ID**: N/A
**Mode**: Implementation
**Date**: 2026-06-11T00:00:00Z

## Task Description

Scan the whole portal for accessibility (ADA/WCAG) compliance, add automated
testing for it, and fix the violations found.

## Actions Taken

- Added `@axe-core/playwright` (dev dependency) and a new `e2e/accessibility.spec.ts`
  that runs axe-core WCAG 2.1 A/AA scans against all 15 static routes, the first
  deal/company/contact detail pages (skipped when the DB has no data), and a
  representative five-page set with the system theme emulated as dark.
- Ran the suite on all three Playwright projects (phone, tablet, desktop) and
  fixed every violation found:
  - `attachment-upload.tsx`: the visually hidden file input had no accessible
    name (axe `label`, critical) → added `aria-label="Attachment file"`
    (named distinctly from the visible "Add photo or file" button so assistive
    tech doesn't announce two identical buttons).
  - `deals/[id]/page.tsx`: the company/contact fact links relied on colour
    alone next to plain text at 2.89:1 (axe `link-in-text-block`, serious) →
    permanent `underline`, matching the company-page link precedent.
  - `globals.css` dark theme: `--blu-foreground` white-on-blue CTA text was
    3.73:1 → dark ink `#06090f` (5.8:1; `--sidebar-primary-foreground` matched);
    `--muted-foreground` was 4.48:1 on `--muted` → `#868a92` (4.73:1);
    `--blu` `#0082e5` was 4.15:1 on `--accent` for the active sidebar item →
    `#1b8df0` (4.77:1).

## Decisions Made

- Fixed contrast at the token level in `globals.css` rather than per-component,
  so every dark-mode use of the tokens benefits. The dark brand blue is now
  `#1b8df0`; the shared-family comment in `globals.css` was updated. If Blu Shed
  shares these tokens, the same change should be ported there.
- Scoped the automated gate to WCAG 2.1 A/AA (`wcag2a/aa`, `wcag21a/aa` axe
  tags). AAA target-size checks are not included.
- Dark-mode scans cover a representative page set (dashboard, pipeline,
  contacts, settings, enquiry) rather than every route, to keep runtime sane;
  the themes share tokens so coverage generalises.

## Issues Encountered

- Full-suite parallel runs against the remote Neon dev DB intermittently hit
  30s navigation timeouts (known environment flake, not a11y failures);
  serial runs (`--workers=1` or `2`) are reliable.
- `deals/[id]/page.tsx` has a pre-existing `noExcessiveCognitiveComplexity`
  lint error (23 vs max 20) at HEAD; out of scope here and left as is.

## Next Steps

- Optionally port the dark-token contrast fixes to Blu Shed if it shares the
  palette.
- Optionally refactor `DealPage` to clear the pre-existing complexity lint.

## Related Files

- e2e/accessibility.spec.ts (new)
- src/components/attachment-upload.tsx
- src/app/(app)/deals/[id]/page.tsx
- src/app/globals.css
- package.json / package-lock.json
