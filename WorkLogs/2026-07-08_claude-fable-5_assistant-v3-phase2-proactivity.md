# Work Log: Assistant v3 Phase 2: proactive weekly report, morning briefing, needs-attention nudges

**Agent**: Claude Fable 5 (claude-fable-5), integration finished under Opus 4.8 after a Fable credit exhaustion
**Session ID**: a4b4700f (continuation of a8cc1e79)
**Mode**: Interactive (roadmap approved by Kurt; built weeks-of-commits ago, parked, shipped LAST per Kurt's reorder 3 -> 4 -> 2)
**Date**: 2026-07-08T02:23Z (suites completing; see the merge/deploy commit for the exact prod time)

## Task Description

Phase 2, the final roadmap piece: proactive assistant output. All three surfaces Kurt asked for: (1) a scheduled Monday weekly pipeline report delivered into a per-user assistant thread plus a notification (closes the scheduled half of PRD FR-8.2); (2) a Tuesday-Friday morning briefing thread (follow-ups due, closing soon, needs attention); (3) needs-attention nudges: the existing stale-deal notification gains an "Ask assistant" button that deep-links into a prefilled assistant composer. The feature was built during the original Phase 2 attempt, then parked on branch `phase-2-proactivity` (commit 5d8149b) when Kurt reordered the phases, and integrated now on top of Phases 3 and 4.

## Actions Taken

- **Rebased `phase-2-proactivity` onto main** (which had gained memory, citations, compaction, and composer power since the branch was cut). Two conflicts, both resolved as clean unions of parallel additions: ai-context.tsx (the branch's requestedThread machinery beside P4's voice/mentions state) and chat-launcher.tsx (the branch's useCallback refactor + requestedThread effect beside P4's export bridge and edit flows). Rebased commit cebd300; build and full typecheck clean.
- **Adversarial review of the never-reviewed diff** (one broad finder, staleness-aware). 5 findings, 3 fixed: (1) the morning briefing hardcoded a 14-day closing window instead of the admin-configured threshold every other surface uses, so briefings disagreed with the dashboard and the Monday report; now uses thresholds.closingSoonDays. (2) the weekly-report thread text said "week starting {today}" over counts from getWeeklyReport's trailing seven-day window; corrected to "week ending {today}". (3) threads were seeded before the notification emit and the pre-check is a read not a lock, so a raced re-run could mint an orphan thread; the losing run now archives the thread it created when the emit dedupes. Accepted with rationale: a dev-only StrictMode double-load on notification-open (harmless in prod, single effect run), and the pre-existing unbounded getStaleDeals/getClosingSoonDeals scans (accepted like the contacts-directory whole-table precedent; revisit with the same pagination pass).
- **Verification**: ultracite clean, full typecheck clean, build clean. New e2e/ai-proactive.spec.ts (4 tests: cron bearer guard, today's-AWST-branch idempotent generation with the notification opening the dock on its thread, stale-deal Ask-assistant prefill without navigation, preferences toggles) plus the notifications and AI regression specs pass. Full desktop suite passed (120). Phone and tablet running.
- Deterministic generation confirmed end to end: no model calls anywhere in the proactive path (templated text + reused getWeeklyReport/alert queries), so evals need no new fixtures.

## Decisions Made

- **Deterministic, not model-written**: the weekly report and briefing threads are templated from the same reconciled queries the reports pages use, so the scheduled output costs nothing and its numbers match the dashboard exactly. A model-written narrative was deferred (Kurt can ask for it later).
- **Idempotency rests on the notification dedupe key** (`{type}:{periodKey}:{userId}`), not the pre-check read: the emit insert is the authority, and a raced loser archives its orphan thread. Weekend runs are a no-op.
- **worker-entry.mjs** dispatches the assistant cron only on the daily `0 23 * * *` trigger (07:00 AWST); the notification sweep keeps firing on both crons. No new wrangler cron expression was needed; the daily one already exists.
- **e2e interaction noted**: ai-proactive.spec and notifications.spec both mutate the shared notification table; under fullyParallel with local retries=0 a two-file run can collide (observed), while the full suite scheduled them apart and passed. This sits inside the documented full-suite flake envelope (CI runs retries=2); the spec cleans its rows at teardown. Not worth cross-file serialization for a 3-user tool; flagged here for whoever next touches notification specs.

## Issues Encountered

- **Fable 5 credits ran out** mid-phase (account-level, not a session limit): a subagent failed with "out of usage credits". Relaunched the e2e workstream on Sonnet (it completed green), and the human switched the main session to Opus 4.8 to finish integration. Worth knowing the credit ceiling is real and separate from the per-window session limit that bit earlier phases.
- The e2e agent found the ai-proactive spec had actually been written in full by the credit-killed prior run (untracked but complete); it fixed two test bugs in it (raw notification inserts omitted the `id`, which has only a Drizzle-side default, and two top-level-regex lint findings).

## Next Steps

- Merge `phase-2-proactivity` to main, push the (no-op, columns already live from P4) schema check, deploy, verify the live version, and add the What's New entry. This COMPLETES the Assistant v3 roadmap (all four phases live).
- First real Monday after deploy: confirm the 07:00 AWST cron fired, the three users got their report threads + notifications, and the numbers match /reports/weekly. Watch `[proactive]` logs.
- PRD updates now due across the whole v3: FR-8.2 fully delivered (one-tap + scheduled), FR-7.7 closed (Phase 4), FR-7.8 memory exception (Phase 3). Fold into the next docs pass.
- Consider a model-written narrative on the weekly report if the team wants commentary, and revisit the unbounded alert-query LIMIT with pagination.

## Related Files

- Rebased commit cebd300. New: src/lib/ai/proactive.ts, src/app/api/cron/assistant/route.ts, e2e/ai-proactive.spec.ts
- Modified: worker-entry.mjs, src/lib/notification-types.ts, src/components/notification-item.tsx, src/app/(app)/notifications/page.tsx, src/components/ai/ai-context.tsx, src/components/ai/chat-launcher.tsx, src/lib/ai/tools/report-tools.ts (toWeeklyReportArtifactData export), src/lib/ai/tools/query-tools.ts (dealListArtifact export)
- Prior logs: 2026-07-08 phase4-composer-compaction-voice, 2026-07-07 phase3-memory-citations, 2026-07-07 phase1
