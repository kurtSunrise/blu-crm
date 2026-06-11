# Work Log: Company Autocomplete (Base UI) + Add Person Prefill

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: cse_01WsDKrW9UJW7aBbMFBca1nW
**Mode**: Implementation (autonomous)
**Date**: 2026-06-11T18:30:00+08:00
**Duration**: ~2.5 hours

## Task Description

User chose the Base UI 1.5 Combobox/Autocomplete route for linking People
and Companies, then asked mid-task whether /deals/new should get it too
(yes). Scope: a company autocomplete on contact create/edit and quick-add,
plus "Add person" on company pages prefilled via /contacts/new?company=.

## Actions Taken

- **`company-field.tsx`** (new): Base UI `Autocomplete` styled to the
  design system. The visible input IS the form field (named companyName,
  one stable DOM node from SSR onward), so FormData semantics, the
  server's find-or-create, and no-JS submits keep working. Existing
  companies filter as you type (44px rows); picking one fills the field;
  an unmatched name creates a company on save (hint text says so). The
  popup is held closed (controlled `open`) while nothing matches so it
  never floats over the fields and submit button below.
- Wired into ContactForm (with `defaultCompanyName`), ContactEditForm,
  and QuickAddForm ("Client / brand *", autofocus + required preserved);
  their pages now fetch company names (quick-add in parallel with owners).
- **Company page**: "Add person" header action linking to
  `/contacts/new?company=<name>`; the new-contact page reads the param
  and prefills the field. New loading skeleton for /contacts/new (now a
  server page).
- **E2E**: three new companies.spec tests: suggestion pick on
  /contacts/new, prefill flow end-to-end, suggestion pick on /deals/new.
  138/138 passing; lint and build clean.

## Decisions Made

- Autocomplete primitive over Combobox: the value is genuinely free text
  (find-or-create), not a selection from a closed set.
- No "Create X" item row: with Autocomplete the typed text is already the
  value; a static hint plus the empty-popup behaviour communicates
  creation without controlled-input complexity.

## Issues Encountered (the important one)

- **Controlled-input hydration clobber.** Base UI renders the input
  controlled, so anything typed before hydration (slow device or loaded
  CI) was wiped on first re-render: quick-add submits went out with an
  empty client and half the suite (38 tests) failed on the loaded box.
  A first fix that swapped a plain SSR input for the enhanced one at
  mount lost a different race: the swap could land mid-`fill()`,
  detaching the node between focus and keystrokes. Final design: one
  stable input, with a mount effect that adopts the DOM value into Base
  UI's controlled state before any re-render can reset it. Verified with
  a standalone CPU-throttled Playwright probe (6x throttle, fill at
  domcontentloaded) that reproduced the loss and then the fix.
- Lesson recorded: enhanced/controlled form fields in this app must
  either hydrate in place adopting the DOM value, or stay uncontrolled.
  Never swap a form input's DOM node after SSR.

## Next Steps

- The same CompanyField could later back a contact-picker on deals.
- Auth milestone still parked on claude/auth-parked.

## Related Files

- src/components/company-field.tsx (new), contact-form.tsx,
  contact-edit-form.tsx, quick-add-form.tsx
- src/app/(app)/contacts/new/page.tsx (+ loading.tsx new),
  contacts/[id]/edit/page.tsx, deals/new/page.tsx, companies/[id]/page.tsx
- e2e/companies.spec.ts
