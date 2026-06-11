# Work Log: Site-wide dropdown sweep — NativeSelect component

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: 2a4f940a-d85e-4e3e-a995-9b577ce87558
**Mode**: Implement
**Date**: 2026-06-11T23:30:00+08:00

## Task Description
The stage-select chevron fix revealed the same browser-drawn-chevron-at-the-
border problem on every other native `<select>` (reported on /inbox). Scan
the whole site and fix all dropdowns. Pull/merge main first.

## Actions Taken
- Reconciled git: committed the deal-page UI work (stage select + timeline)
  and pushed; origin was already fully merged (contacts area + user's merge).
- New `src/components/ui/native-select.tsx`: a styled native `<select>`
  (`appearance-none`, `pr-9`, lucide chevron inset at `right-3`), visually
  matched to the ui/select.tsx trigger (rounded-lg, border-input, focus ring,
  `dark:bg-input/30`), h-11 touch target, `containerClassName` for flex
  sizing.
- Replaced all nine remaining native selects across seven components:
  inbox-triage (Assign to), stage-change-dialog (Lost reason), quick-add-form
  (project type, owner), follow-up-form (owner), csv-import (import kind,
  per-column mapping), enquiry-form (project type), stage-manager (reassign
  deals). Removed the per-file `SELECT_CLASSES` constants.

## Decisions Made
- **Native select wrapper, not the Base UI popup Select**, for these nine:
  they are FormData-named form fields and/or e2e-driven via `selectOption`;
  the native element keeps form semantics, `required` validation, the
  platform picker on phones (mobile-first product), and breaks zero tests.
  The popup Select (ui/select.tsx) remains the choice for richer controls
  like the deal-page stage selector. Guidance comment added in
  native-select.tsx.

## Verification
- `npm exec -- ultracite check` clean; `npm run build` passes.
- Screenshots (production build): /inbox light + dark, /deals/new, /enquire —
  chevrons inset correctly everywhere.
- E2E (serial, desktop): csv-import ✓✓, settings ✓✓, won-lost ✓✓✓ (reason
  select), intake honeypot/enquiry-submit ✓. Remaining failures are
  pre-existing environment issues, re-verified as such:
  - intake assign/discard: manual instrumented probe showed the assign POST
    fires and succeeds (lead gone after reload) — the 5s assert window is
    beaten by the inbox now rendering 700+ accumulated dev-DB leads.
  - stage-management add-stage step: hydration click race (the spec's own
    `openPanel` helper documents it but the Add click isn't retried).
  - quotes/follow-ups: known dropped-click/latency flake, fails before or
    independent of any select.

## Next Steps
- The dev-DB inbox holds 700+ test leads; a periodic wipe (or local Postgres
  for e2e) would restore the intake specs.
- stage-management.spec could retry its "Add stage" click like its own
  openPanel helper does.

## Related Files
- src/components/ui/native-select.tsx (new)
- src/components/{inbox-triage,stage-change-dialog,quick-add-form,follow-up-form,csv-import,enquiry-form,stage-manager}.tsx
