# Work Log: Fix Workers Builds CI failure (DATABASE_URL at module scope)

**Agent**: Claude Fable 5 (Claude Code)
**Session ID**: 565839db-ef70-4af0-8700-aad9be96c396
**Mode**: Ops / bugfix
**Date**: 2026-06-11T05:10:00Z

## Task Description
Cloudflare Workers Builds for worker `blu-crm` (account `6a4358...`, repo `kurtSunrise/blu-crm`) had failed four times in a row. Diagnose build `86d427dc` and get CI building again.

## Actions Taken
- Read the failed build log via the dashboard share link (the local wrangler/MCP auth is on a different Cloudflare account, `0f665c...`, so the API could not reach this build directly).
- Root cause: `next build` → "Collecting page data" evaluates route modules, and `src/db/index.ts` threw `DATABASE_URL is not set` at module scope. The Workers Builds environment has **no build variables configured**, so every CI build died at this step (`Failed to collect page data for /api/attachments/[id]`).
- Fix: made the Drizzle client lazy — `db` is now a `Proxy` that creates the real client on first property access, so importing it is side-effect free and the build needs no DB credentials.
- Verified locally by moving `.env.local` aside and running `npm run build` with no env vars: build completed. `ultracite check` clean.
- Committed as `5ab0ea2` and pushed to `main`; Workers Builds auto-triggered build `d263a057`.

## Decisions Made
- Chose lazy initialization over adding `DATABASE_URL` as a CI build variable: builds shouldn't require production DB credentials, and the secret stays runtime-only on the Worker.
- `NEXT_PUBLIC_APP_URL` is also absent in CI builds; it is only used as the Better Auth client `baseURL`, which falls back to same-origin, so no build variable was added.

## Issues Encountered
- The commit unintentionally included the files already staged in the index (new `src/components/ai/*` components from the in-progress M4 AI assistant work) alongside the one-file fix. Verified the committed tree type-checks (`tsc --noEmit` against a stash of the unstaged changes) and that all component imports exist in the committed `package.json`, so CI is not broken by the partial inclusion. The integration files (`src/lib/ai/*`, chat route, app-shell, wrangler.jsonc, package.json) remain uncommitted in the working tree.

## Next Steps
- Confirm build `d263a057` (commit `5ab0ea2`) goes green end-to-end, including the `npx wrangler deploy` step.
- The M4 AI assistant working-tree changes still need their own commit when that work lands.

## Related Files
- src/db/index.ts (fix)
- src/components/ai/* (swept into the commit; pre-staged M4 work)
