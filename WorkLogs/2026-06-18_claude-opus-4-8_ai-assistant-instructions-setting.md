# Work Log: Custom AI Assistant Instructions Setting

**Agent**: Claude Opus 4.8 (claude-opus-4-8)
**Session ID**: N/A
**Mode**: Plan then implement (feature)
**Date**: 2026-06-18T00:10:00Z

## Task Description

Add a place in Settings for the team to enter freeform "Instructions" for the AI Assistant Chat (for example email-tone rules). The saved text is appended to the assistant's system prompt so it shapes every chat and every draft.

## Actions Taken

- Added `src/lib/ai/assistant-instructions.ts`: `AI_ASSISTANT_INSTRUCTIONS_KEY`, `getAssistantInstructions()` (reads the `app_setting` row), and `buildInstructionsBlock()` (wraps saved text as a labelled `# Team instructions` block, returns null when empty).
- Added `aiInstructionsSchema` (trimmed string, max 4000 chars, empty allowed) in `src/lib/validation/settings.ts`.
- Added `updateAssistantInstructions` server action in `src/lib/actions/settings-actions.ts` (upsert into `app_setting`, `revalidatePath("/settings/ai")`).
- Injected the instructions into the system prompt in `src/lib/ai/agent-loop.ts`: built the `system` array once before the loop, with the static `SYSTEM_PROMPT` keeping its own cache breakpoint and the team instructions as an optional second `ephemeral` block.
- Added `src/components/assistant-instructions-form.tsx` (textarea form following `alert-thresholds-form.tsx`).
- Replaced the "Coming soon" AI assistant panel in `src/app/(app)/settings/ai/page.tsx` with the new form.
- Added an e2e test in `e2e/settings.spec.ts` covering save, persistence across reload, and clearing.

## Decisions Made

- **Org-wide, not per-user**: stored in the existing `app_setting` key/value table, consistent with every other setting (the app is single-workspace). No new table or migration.
- **Second system block, not editing `SYSTEM_PROMPT`**: keeps the static prompt byte-stable so its prompt cache prefix always hits. The instructions block gets its own `ephemeral` cache_control; caching is prefix-based so the static prefix survives an instructions change.
- **Treated as trusted instructions**: the text is authored by authenticated team members in Settings, unlike `<page_context>`/`<enquiry_data>` client data, so it is presented as genuine guidance.
- **4000-char cap**: bounds the prompt budget against an oversized paste; empty is allowed and reverts the assistant to defaults.

## Issues Encountered

- `ultracite fix` over the whole repo fails on a nested `biome.jsonc` under a leftover `.kilo/worktrees/rigorous-hallway/` directory (unrelated to this change). Scoped the lint to the changed files instead — passes.
- E2E could not run: `global-setup` sign-in returns HTTP 401 because this environment's database is not seeded. The "local" dev DB is the shared remote Neon instance the live Worker also uses, so `npm run db:seed` was intentionally NOT run. The new test parses and registers across all three viewports (`--list`), but was not executed here.

## Verification

- `npm exec -- ultracite fix` (scoped to changed files): pass.
- `npx tsc --noEmit`: clean.
- `npm run build`: succeeds; `/settings/ai` compiles.
- E2E: written, not run (see Issues). Needs a seeded DB.

## Next Steps

- Run `e2e/settings.spec.ts -g "AI assistant instructions"` against a seeded DB.
- Manually confirm a drafted follow-up email reflects the saved guidance, then deploy via local `npm run deploy` (Paid account) per the deployment topology.

## Related Files

- `src/lib/ai/assistant-instructions.ts` (new)
- `src/lib/validation/settings.ts`
- `src/lib/actions/settings-actions.ts`
- `src/lib/ai/agent-loop.ts`
- `src/components/assistant-instructions-form.tsx` (new)
- `src/app/(app)/settings/ai/page.tsx`
- `e2e/settings.spec.ts`
