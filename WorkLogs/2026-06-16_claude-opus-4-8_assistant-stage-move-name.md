# Work Log: Show a meaningful stage name in the assistant's "Move a deal" confirmation card

**Agent**: Claude Opus 4.8 (Claude Code)
**Session ID**: N/A
**Mode**: Plan then implement
**Date**: 2026-06-16T00:19:50Z

## Task Description

The AI Assistant's gated "Move a deal to another stage" confirmation card displayed the target stage as a raw UUID (`2b516e20-903e-4d97-bcf0-ecbe1a555314`), which is meaningless to a salesperson reviewing the change. Make the card show the human stage name instead.

## Actions Taken

- Added `resolveStageId(handle)` and `STAGE_HANDLE_DESCRIPTION` to `src/lib/ai/tools/resolve-deal.ts`, mirroring the existing `resolveDealId` handle pattern. Resolves a stage name (case-insensitive) or, as a fallback, the internal id, to `{ id, name }`.
- Changed the `move_deal_stage` tool schema field from `stageId` (UUID) to `stage` (name) in `src/lib/ai/tools/deal-tools.ts`. The tool now resolves the name to the internal id before calling the `moveDealStage` action, returns a helpful error when no stage matches, and reports "Deal moved to <name>." on success.
- Updated `list_pipeline_stages` description (`src/lib/ai/tools/query-tools.ts`) and the system prompt (`src/lib/ai/system-prompt.ts`) to steer the model to pass the exact stage name when proposing a move.

## Decisions Made

- **Resolve at the tool layer, not the card.** The confirmation card (`src/components/ai/confirmation-card.tsx`) is generic and global, with no access to stage data; resolving UUID -> name there would mean shipping stage data to the client. Resolving name -> id in the tool matches the established `resolveDealId` convention, keeps the card untouched, and improves the audit trail (`recordProposedToolCall` now stores the readable name).
- **Kept the server action and its validation schema unchanged.** `moveDealStage` and `src/lib/validation/deal.ts` still require the UUID `stageId`; only the AI-tool input contract changed.
- **Resolver accepts an id as a fallback** so a stray UUID from the model still works, while the description/prompt push toward names.

## Issues Encountered

- None. `npm exec -- ultracite check` clean on the four changed files; `npx tsc --noEmit` passes with zero errors.

## Next Steps

- Manual check in the running app: ask the assistant to move a deal to a named stage and confirm the card shows the name; verify the move and timeline entry. Optionally extend Playwright coverage for the gated stage-move flow.

## Related Files

- `src/lib/ai/tools/resolve-deal.ts`
- `src/lib/ai/tools/deal-tools.ts`
- `src/lib/ai/tools/query-tools.ts`
- `src/lib/ai/system-prompt.ts`
