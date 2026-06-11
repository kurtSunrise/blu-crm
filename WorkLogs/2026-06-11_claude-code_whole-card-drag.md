# Work Log: Pipeline cards draggable from anywhere on the card

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: 2a4f940a-d85e-4e3e-a995-9b577ce87558
**Mode**: Bug fix
**Date**: 2026-06-11T08:58:00+08:00

## Task Description
User reported being unable to drag pipeline cards.

## Diagnosis
Reproduced with scripted pointer drags against a production build: dragging
from the small grip handle worked, dragging from the card body did not —
`useDraggable` listeners were attached only to the 32px-wide grip button, so
grabbing the card anywhere else (the natural gesture) did nothing and read as
broken.

## Actions Taken
- `src/components/deal-card.tsx`: moved the dnd-kit `listeners` onto the
  whole `<article>`; the grip icon stays as a decorative affordance
  (`aria-hidden` span). Existing activation constraints keep other gestures
  intact: pointer drags need 6px of travel and touch drags a 200ms hold, so
  clicks/taps on the card link and menu still work; `touch-manipulation`
  (not `touch-none`) leaves one-finger column scrolling to the browser;
  `select-none` stops text selection during mouse drags; `draggable={false}`
  on the inner link prevents the native link-drag ghost; `cursor-grab` /
  `cursor-grabbing` signal the gesture.
- Dropped the unused `attributes` spread: no KeyboardSensor is wired, so the
  accessible non-drag path to move a deal remains the card's dropdown menu
  (unchanged, e2e-covered).

## Verification (scripted browser probes + e2e, production build)
- Body drag Lead Captured → Qualified: card moves, stage persists.
- Plain click on the card title still opens the deal; phone-viewport tap too.
- Move-to-stage dropdown still opens.
- `ultracite check` clean, `npm run build` passes.
- e2e pipeline + won-lost + calendar serial: all board/menu/dialog tests
  pass; the only failures were the documented Neon-latency steps
  (quick-log/follow-up server actions), unrelated to dragging.

## Related Files
- src/components/deal-card.tsx
