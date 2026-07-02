# Work Log: Deal value range and contact lookup on quick-add

**Agent**: claude-sonnet-5
**Session ID**: N/A
**Mode**: Implementation (plan-mode design + direct implementation, no sub-agent delegation for coding)
**Date**: 2026-07-02T11:00:00+08:00

## Task Description

On the `/deals/new` quick-add form, reps could only enter a single "Value guess
(AUD)" figure and had to free-type client contact details every time, even when
the contact already existed in the system. Added an optional min/max value
range and a searchable contact picker that auto-fills the company and locks the
contact's phone/email once selected.

## Actions Taken

- Added a new nullable `estimatedValueMaxCents` column to `src/db/schema.ts`
  and pushed it with `npm run db:push`. `estimatedValueCents` keeps its
  existing meaning as the min/single value, so no other read site needed to
  change.
- Extended `computeDealValue()` in `src/lib/deal-values.ts` with a third
  parameter so it synthesizes a `valueRange` from the min/max estimate when a
  deal has no quotes yet, using the minimum as the headline `valueCents`.
- Wired the new field through `quickAddDealSchema` (`src/lib/validation/deal.ts`),
  `createQuickAddDeal` (`src/lib/actions/deal-actions.ts`), and
  `createLead` / `CreateLeadInput` (`src/lib/intake.ts`).
- Updated both `computeDealValue` call sites (`pipeline/page.tsx`,
  `pipeline/closed/page.tsx`) to pass the new estimate field.
- Extracted a shared `src/components/deal-value-display.tsx` and used it in
  both `deal-card.tsx` and `closed-deals-list.tsx` so the two views render
  value/valueRange identically.
- Split the "Value guess (AUD)" input on the quick-add form
  (`src/components/quick-add-form.tsx`) into optional "Value guess min (AUD)"
  and "Value guess max (AUD)" inputs.
- Built `src/components/contact-field.tsx`, a Base UI Combobox-based
  autocomplete generalized from the existing `company-field.tsx` skeleton, so
  reps can search and select an existing Contact.
- Added controlled `value` / `onValueChange` props to `company-field.tsx`
  (additive, backward compatible) so selecting a contact can programmatically
  set the Client/brand field from the contact's linked company.
- On contact selection, phone/email inputs become `readOnly` (not `disabled`)
  with a "Change contact" button to clear the selection and unlock manual entry.
- Added `contactId` to `quickAddDealSchema` and threaded it through
  `createQuickAddDeal` (existence + not-soft-deleted check) and
  `createLead` / `findOrCreateContact`, bypassing find-or-create entirely when
  `contactId` is supplied.
- Added a contacts query (joined to company) in
  `src/app/(app)/deals/new/page.tsx`, passed down as a flat list prop,
  matching the existing "load full list, filter client-side" pattern already
  used by `CompanyField` / the contacts directory.
- Updated `e2e/pipeline.spec.ts`, `e2e/contacts.spec.ts`,
  `e2e/closed-deals.spec.ts`, `e2e/quotes.spec.ts`, and `e2e/reports.spec.ts`
  (label rename for 5 specs to match the split value inputs), and added two
  new tests: "quick-add with a value range shows the range on the pipeline
  card" (pipeline.spec.ts) and "selecting an existing contact locks
  phone/email and auto-fills the company" (contacts.spec.ts).
- Ran `npm exec -- ultracite check` / `fix` scoped to changed files,
  `npm run build`, and `npx playwright test` for the affected specs.

## Decisions Made

- Added `estimatedValueMaxCents` as an additive nullable column rather than
  migrating the meaning of `estimatedValueCents`, so reports, AI tools, and
  contact/company rollups that already read `estimatedValueCents` need zero
  changes.
- When synthesizing a `valueRange` from the estimate, the minimum becomes the
  headline `valueCents` for consistency with the existing single-value
  convention used everywhere else in the app.
- Locked contact fields use `readOnly`, not `disabled`, specifically because
  `disabled` inputs are excluded from `FormData` on submit; `readOnly` still
  submits the auto-filled values while preventing edits.
- Reused the existing "load full list, filter client-side" pattern for the
  contact picker instead of building a new server-search API route, to match
  the pattern already established by `CompanyField` and the contacts
  directory and avoid introducing a second data-fetching approach.
- Extracted `deal-value-display.tsx` as a shared component specifically to
  fix (and prevent recurrence of) the `valueRange`-dropping bug described
  below, rather than patching `closed-deals-list.tsx` in place.

## Issues Encountered

- Found and fixed a pre-existing bug: `pipeline/closed/page.tsx` computed
  `valueRange` but dropped it before it reached `ClosedDealsList`, so closed
  deals with a value range never showed it. Fixed as part of this work by
  routing both `deal-card.tsx` and `closed-deals-list.tsx` through the new
  shared `deal-value-display.tsx`.
- Full-repo `ultracite check` is currently blocked by an unrelated,
  pre-existing issue: a stray git worktree at
  `.kilo/worktrees/rigorous-hallway` has its own nested `biome.jsonc` that
  conflicts with the root config. Not touched or fixed here; checks were
  scoped to the changed files instead.
- A handful of unrelated, pre-existing Playwright tests (duplicate contact
  warning, contact edit/archive, company rollup, Won/Lost column collapse)
  flaked under 4-worker parallel execution against the shared remote e2e
  Neon DB, but passed cleanly re-run with `--workers=1`. Confirmed as
  pre-existing environment flake, not a regression from this change.

## Next Steps

- AI tool schemas (`deal-tools.ts`), CSV import schema, and the public
  web-enquiry schema were deliberately left on single-value/free-text
  semantics; extending them to support a value range or contact lookup is a
  candidate follow-up if wanted.
- No UI exists yet to edit the value range or reassign the linked contact
  after deal creation; would need a follow-up if reps need to correct these
  post-creation.
- `findDuplicateContacts` fuzzy-warning logic was not wired into the new
  contact picker; worth revisiting if duplicate contacts start appearing via
  this path.
- No new server-search API route was built for contacts; if the contacts
  list grows large enough that client-side filtering becomes slow, a
  search endpoint is the natural next step.

## Related Files

- `src/db/schema.ts`
- `src/lib/validation/deal.ts`
- `src/lib/actions/deal-actions.ts`
- `src/lib/intake.ts`
- `src/lib/deal-values.ts`
- `src/app/(app)/pipeline/page.tsx`
- `src/app/(app)/pipeline/closed/page.tsx`
- `src/app/(app)/deals/new/page.tsx`
- `src/components/deal-card.tsx`
- `src/components/closed-deals-list.tsx`
- `src/components/company-field.tsx`
- `src/components/quick-add-form.tsx`
- `src/components/contact-field.tsx` (new)
- `src/components/deal-value-display.tsx` (new)
- `e2e/pipeline.spec.ts`
- `e2e/contacts.spec.ts`
- `e2e/closed-deals.spec.ts`
- `e2e/quotes.spec.ts`
- `e2e/reports.spec.ts`
- Related prior work: `2026-06-30_claude-opus-4-8_pipeline-closed-windowing.md`
  (introduced `deal-values.ts` and `closed-deals-list.tsx`, both touched again
  here)
