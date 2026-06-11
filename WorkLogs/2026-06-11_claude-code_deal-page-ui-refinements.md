# Work Log: Deal page UI refinements — stage select and timeline

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: 2a4f940a-d85e-4e3e-a995-9b577ce87558
**Mode**: Implement
**Date**: 2026-06-11T22:30:00+08:00

## Task Description
On the deal detail page: (1) the stage dropdown's chevron touched the right
border of its container; (2) replace the plain timeline list with a
best-in-class shadcn-style timeline.

## Actions Taken
- `src/components/stage-select.tsx`: replaced the native `<select>` (whose
  chevron is browser-drawn at the far edge) with the shadcn/Base UI Select
  already in `src/components/ui/select.tsx` — full-width trigger,
  `data-[size=default]:h-11` to keep the 44px touch target, `items` passed to
  the Root so the selected label server-renders. Won/Lost dialog flow
  unchanged; as a controlled component it now also visually reverts while the
  Won/Lost dialog is open.
- New `src/components/deal-timeline.tsx`: rail-style timeline — per-type
  lucide icon in a circular marker (call/email/site visit/meeting/note
  neutral, stage changes brand blue, quote events green), hairline connector
  between items, label · author · AWST timestamp header with the content
  below, and a permanent brand-tinted "Lead created" origin marker at the
  foot (replacing the old footer text).
- `src/app/(app)/deals/[id]/page.tsx`: renders `DealTimeline`; removed the
  now-unused `ACTIVITY_LABELS` map and badge-row markup.
- Hardened `e2e/pipeline.spec.ts:62` ("logs a call onto the timeline") with
  the click-retry `toPass` pattern from `e2e/calendar.spec.ts`, since it was
  the noisiest dropped-click victim.

## Decisions Made
- Used the existing ui/select.tsx rather than styling the native select:
  consistent with the design system, and no e2e drives this control via
  `selectOption` (verified), so the swap is safe.
- Timeline markers colour only the two "milestone" types (stage change,
  quote); day-to-day contact logging stays neutral so milestones stand out.

## Issues Encountered
- Trigger height: a plain `h-11` loses to the component's
  `data-[size=default]:h-8` variant at CSS specificity — override must be
  `data-[size=default]:h-11`.
- `pipeline.spec.ts:62` still fails occasionally even with retries: error
  snapshots show the quick-log buttons `[disabled]` with the server action in
  flight past 25 s — that is the remote Neon dev-DB latency documented in the
  e2e environment notes, not a UI bug (flow verified working manually and on
  most runs). Local Postgres for e2e remains the real fix.

## Verification
- `npm exec -- ultracite check` — clean.
- `npm run build` — passes.
- Screenshots against a production build: trigger chevron correctly inset;
  dropdown popup renders with check indicator; timeline rail renders with
  icons, connector, and Lead created marker.
- `e2e/pipeline.spec.ts` + `e2e/won-lost.spec.ts` serial run: 20/21 passed;
  the single failure is the documented Neon-latency flake above (passes on
  re-run).

## Next Steps
- Consider the same `toPass` hardening for quotes/intake/follow-ups specs.
- Consider a local Postgres for deterministic e2e (already noted in
  TEAM_CONSTITUTION env docs and the e2e environment memory).

## Related Files
- src/components/stage-select.tsx
- src/components/deal-timeline.tsx (new)
- src/app/(app)/deals/[id]/page.tsx
- e2e/pipeline.spec.ts
