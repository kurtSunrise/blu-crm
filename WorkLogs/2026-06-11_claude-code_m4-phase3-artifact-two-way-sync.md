# Work Log: M4 Phase 3 — Artifact Two-Way Sync

**Agent**: Claude Code
**Mode**: Implementation (continuation of the approved M4 assistant plan)
**Date**: 2026-06-11

## Task Description

Phase 3 of the M4 assistant: artifacts sync both ways. The user can rework
what the assistant proposes before it lands: gated-write inputs are edited
in the confirmation card and ride the existing `finalInput` round-trip
(re-validated by the tool's zod schema, captured in `ai_audit_log`), and
draft messages are edited in place on the card before copying.

## Actions Taken

- **Editable confirmation card** (`src/components/ai/confirmation-card.tsx`):
  while a gated write is pending, every primitive input field renders as an
  editable control (string → Input/Textarea by length, number → numeric
  Input, boolean → NativeSelect Yes/No; non-primitives stay read-only).
  Edits travel as strings and are parsed back against the original value's
  type at confirm; cleared optional fields are omitted rather than sent as
  empty strings. `finalInput` is only attached when something actually
  changed. Resolved/history cards render the decided values (edits
  included) as the read-only summary grid.
- **Editable draft artifact**
  (`src/components/ai/artifacts/draft-message-artifact.tsx`): Edit/Done
  toggle swaps the body for a labelled textarea; Copy always copies the
  current body, and the meta line flips to "edited draft" when it differs
  from the model's version.
- **Mock script** (`e2e/mock-anthropic-server.ts`): a user message matching
  /draft/i now returns a `present_draft` tool_use with a fixed follow-up
  email, so draft-card behaviour is testable end to end.
- **E2E** (`e2e/ai-assistant.spec.ts`): "an edited confirmation applies the
  edited values" (edit company name before Confirm → audit row keeps the
  proposal in `input` and the edit in `final_input`, /inbox shows the
  edited lead and not the proposed name) and "a draft artifact is editable
  in place". The capture helper now asserts the proposal via the editable
  field's value (the token moved from text into an input).

## Decisions Made

- No new protocol or schema: the `finalInput` path shipped with Phase 2's
  route/audit/types was already end-to-end, so two-way sync for writes is
  purely a card-level concern. Server-side zod re-validation stays the
  single source of truth for what an edited input may contain.
- Draft edits stay client-local: `present_draft` saves nothing server-side
  (FR-7.4 drafts are copy-only), so there is nothing to sync upstream; the
  user continues the conversation in chat if they want the model's help
  reworking it.

## Issues Encountered

- Biome's `noNoninteractiveTabindex` vs axe's `scrollable-region-focusable`
  on the pipeline scroller fix from the Phase 2 session: resolved with a
  `<section>` plus a targeted single-line suppression directly above the
  `tabIndex` attribute (multi-line JSX suppression comments do not attach).

## Verification

- `npm exec -- ultracite check` — clean (189 files).
- `tsc --noEmit` — clean.
- `npm run build` — passes.
- Full Playwright suite — 225 passed, 3 skipped (pre-existing intentional),
  0 failed across phone/tablet/desktop; assistant specs now 7 per project.

## Next Steps

- Phase 4: persisted thread list + resume UX.
- Phase 5: P1 extras (lead scoring), eval set, docs.

## Related Files

- `src/components/ai/confirmation-card.tsx`
- `src/components/ai/artifacts/draft-message-artifact.tsx`
- `src/components/pipeline-board.tsx`
- `e2e/ai-assistant.spec.ts`, `e2e/mock-anthropic-server.ts`
