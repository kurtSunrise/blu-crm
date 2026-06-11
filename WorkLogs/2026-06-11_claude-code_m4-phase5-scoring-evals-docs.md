# Work Log: M4 Phase 5 — Lead Scoring, Eval Set, Docs

**Agent**: Claude Code
**Mode**: Implementation (final phase of the approved M4 assistant plan)
**Date**: 2026-06-11

## Task Description

Close out M4: the P1 extras that fit V1, the model-quality eval set the PRD
gates the milestone on, and user-facing docs for the assistant.

## Actions Taken

- **FR-7.5 lead scoring** (`src/lib/ai/tools/scoring-tools.ts`): new
  read tool `rank_open_deals`. The score (0-100) is computed
  deterministically server-side so it is stable and explainable:
  likelihood (the stage's admin-set forecast weighting, FR-8.1, up to 40),
  value relative to the open pipeline (up to 30), and deadline pressure
  ramping over the final 45 days to a fixed/expected date (up to 30), with
  7+ day staleness flagged in the reasons. Deals come back as the standard
  deal-list artifact ("Deals to chase first") plus per-deal reason strings
  the model is instructed to present rather than invent.
- **Eval set** (`evals/fixtures.ts`, `evals/run.ts`, `npm run ai:eval`):
  12 fixtures against the REAL model (PRD §9.6), one call each, grading
  the first response's tool selection, inputs, and text. Covers FR-7.1
  queries, FR-7.2 capture (complete enquiry → `create_lead` with verbatim
  rawNote; thin enquiry → must ask, not write), FR-7.4 drafts (kind +
  no-em-dash brand rule), FR-7.9 qualification questions, FR-7.6
  summaries, FR-7.8 look-up-before-write, FR-7.5 scoring, and a
  prompt-injection fixture (pasted enquiry text must never drive
  non-capture writes). Tools are never executed, so the run is read-only.
  Exits 1 under the 80% M4 gate; skips cleanly when ANTHROPIC_API_KEY is
  unset.
- **Docs**: "The Blu assistant" section on /help covering queries,
  capture, drafts, confirmation gating, history/resume, and offline
  behaviour.
- **E2E**: mock server scripts `rank_open_deals` for chase/prioritise
  messages; new spec seeds a lead and asserts the ranked artifact renders
  rows from the live DB.

## Decisions Made

- **Voice notes (FR-7.7) stay deferred**: PRD open question Q3 (Claude-side
  vs device speech API transcription) is owned by Kurt and unresolved;
  building either path now would pre-empt that decision.
- FR-7.9 / FR-7.10 needed no new work: `present_draft` has shipped both
  kinds since Phase 1; the eval set now pins the behaviour.
- Eval grading is single-turn by design: tool selection and input shape
  are gradeable deterministically; multi-turn conversation quality stays a
  human judgement call.

## Verification

- `npm exec -- ultracite check` — clean (197 files).
- `tsc --noEmit` — clean.
- `npm run build` — passes.
- `npm run ai:eval` — skip path verified (no API key in this container);
  run it with a real key before declaring the M4 gate met.
- Assistant specs 27/27 (9 specs x phone/tablet/desktop); full Playwright
  suite 231 passed, 3 skipped (pre-existing intentional), 0 failed.

## Next Steps

- Run `npm run ai:eval` with a real ANTHROPIC_API_KEY and record the score
  against the 80% gate (M9 fixture metric).
- `npm run preview` NDJSON check on workerd before the first assistant
  deploy; create the `blu-crm-cache` R2 bucket.
- FR-7.7 voice notes once Q3 (transcription path) is decided.
- Consider persisting artifact/confirmation data parts so resumed threads
  re-render cards (history is text-only today).

## Related Files

- `src/lib/ai/tools/scoring-tools.ts`, `src/lib/ai/tools/index.ts`
- `evals/fixtures.ts`, `evals/run.ts`, `package.json`
- `src/app/(app)/help/page.tsx`
- `e2e/ai-assistant.spec.ts`, `e2e/mock-anthropic-server.ts`
