# Work Log: Settings option to choose the assistant model

**Agent**: Claude Code (claude-opus-4-8)
**Session ID**: a7203935-a87f-4376-9718-6da8b5d5ae88
**Mode**: Implementation
**Date**: 2026-07-02T00:00:00Z

## Task Description
Add an admin option in Settings → AI Preferences to choose which Claude model the in-app
assistant runs on, instead of it being a hardcoded constant. Follow-on to the same session's
media-type fix + Sonnet 5 switch.

## Actions Taken
- New `src/lib/ai/models.ts`: pure catalog (no DB import) shared by the client form, server
  validation, and the resolver — `AI_MODEL_KEY`, `DEFAULT_AI_MODEL` (`claude-sonnet-5`),
  `AI_MODEL_OPTIONS` (Opus 4.8 / Sonnet 5 / Haiku 4.5), and `isKnownAiModel`.
- `src/lib/ai/client.ts`: removed the hardcoded `DEFAULT_MODEL`; `getAiModel` is now async and
  resolves env `AI_MODEL` → stored org setting → default. Added `getStoredAiModel` (reads
  `app_setting`, validates against the catalog).
- Updated the two runtime call sites for the now-async resolver: `agent-loop.ts` resolves the
  model once before the loop; `attachment-describe.ts` awaits it. Also updated `evals/run.ts`.
- `src/lib/validation/settings.ts`: added `aiModelSchema` (`z.string().refine(isKnownAiModel)`).
- `src/lib/actions/settings-actions.ts`: added `updateAiModel` server action, mirroring
  `updateAttachmentDescriptionMode` (upsert into `app_setting`, revalidate `/settings/ai`).
- `src/components/ai-model-form.tsx`: client form (NativeSelect of catalog options, save
  button, saved/error status), with a note shown when an `AI_MODEL` env override is active.
- `src/app/(app)/settings/ai/page.tsx`: new "Assistant model" section seeded with
  `getStoredAiModel()`.

## Decisions Made
- Stored in `app_setting` like every other org setting — no schema/migration change needed.
- `AI_MODEL` env var still wins when set, preserving the E2E mock and deploy-free tuning; it is
  unset in prod, so the Settings choice is authoritative there.
- Catalog kept to models with vision + tool support; `isKnownAiModel` prevents persisting an
  unknown id and guards against a retired model lingering in the DB.
- Kept `models.ts` free of server imports so the client form and validation share one source
  of truth without pulling the DB client into a client bundle.

## Issues Encountered
- First `npm run build` failed at "Collecting build traces" with ENOENT on
  `_not-found/page.js.nft.json` — a transient Next 16 `--webpack` trace-worker race (the file
  was present afterwards). A clean `rm -rf .next && npm run build` passed with exit 0.

## Verification
- `ultracite check` on all 9 changed files: clean.
- `npx tsc --noEmit`: exit 0, zero errors.
- `npm run build`: exit 0 (clean rebuild), 10/10 static pages.
- Not yet driven in a browser (settings page is auth-gated) or deployed.

## Next Steps
- Deploy via local `npm run deploy` (Paid `kurt-0f6`) so it can be tested live at
  Settings → AI Preferences → Assistant model.

## Related Files
- `src/lib/ai/models.ts`, `src/lib/ai/client.ts`, `src/lib/ai/agent-loop.ts`,
  `src/lib/ai/attachment-describe.ts` (changed/new)
- `src/lib/validation/settings.ts`, `src/lib/actions/settings-actions.ts` (changed)
- `src/components/ai-model-form.tsx` (new), `src/app/(app)/settings/ai/page.tsx` (changed)
- `evals/run.ts` (changed)
