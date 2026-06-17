# Work Log: Record completed follow-ups on the deal timeline

**Agent**: Claude Opus 4.8 (claude-opus-4-8)
**Session ID**: N/A
**Mode**: Plan → Implement
**Date**: 2026-06-17T00:00:00+08:00
**Duration**: ~1 session

## Task Description
When a follow-up was marked done, the only effect was setting `followUp.completedAt`; the
follow-up silently dropped off the open list with no record on the deal's activity
timeline. This change writes a timeline entry on completion so it shows as a distinct
"Follow-up completed" event.

## Actions Taken
- Added a dedicated `follow_up` member to the `activityType` pgEnum in `src/db/schema.ts`.
- In `completeFollowUp` (`src/lib/actions/follow-up-actions.ts`), extended the `.returning(...)`
  to pull `action`, and inserted an `activity` row (`type: "follow_up"`, `content: action`,
  `createdBy: getSessionUserId()`) before the existing revalidations.
- Added a `follow_up` entry to `ENTRY_STYLES` in `src/components/deal-timeline.tsx`
  ("Follow-up completed" label, `CheckCircle2` icon, success-tinted marker).
- Added an E2E test in `e2e/follow-ups.spec.ts` asserting the completed follow-up appears on
  the deal Timeline section.
- Ran `npm run db:push` (the shared Neon DB lives in `.env.local`; `.env.production` has no
  `DATABASE_URL`). Applied the enum value plus the additive in-flight columns already pending
  in the working tree.
- `npm exec -- ultracite fix` (clean) and `npx tsc --noEmit` (no errors).

## Decisions Made
- Chose a dedicated `follow_up` activity type over reusing `note` (user-selected) for a clear,
  distinct timeline label and icon. Cost: a Postgres enum change pushed via drizzle-kit.
- Single insertion point in `completeFollowUp` so both callers — the UI button and the AI
  `complete_follow_up` tool — inherit the behaviour with no per-caller change.
- `createdBy` uses `getSessionUserId()`, yielding null on the AI path, consistent with how
  `stage_change` is attributed.

## Issues Encountered
- `npm run db:push:prod` failed: `.env.production` has no `DATABASE_URL`. Used `npm run db:push`
  (reads `.env.local`), which targets the shared Neon instance. Push succeeded.
- The Playwright run is blocked at `e2e/global-setup.ts`: sign-in as `kurt@blu.builders`
  returns HTTP 401 ("Run npm run db:seed against this database first"). This is a
  seed/environment condition, not a fault in the new test (the spec collected fine). The new
  test was therefore not executed in this session.

## Next Steps
- Seed the E2E target DB (`npm run db:seed`) and run
  `npx playwright test follow-ups.spec.ts -g "records it on the deal timeline"`.
- Optionally run `npm run build` before deploy; ship via local `npm run deploy` (Paid account).

## Related Files
- src/db/schema.ts
- src/lib/actions/follow-up-actions.ts
- src/components/deal-timeline.tsx
- e2e/follow-ups.spec.ts
- src/lib/ai/tools/follow-up-tools.ts (unchanged; inherits behaviour)
