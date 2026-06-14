# Work Log: Fix Cloudflare Worker 3 MiB size-limit deploy failure (webpack build)

**Agent**: Claude Opus 4.8 (Claude Code)
**Session ID**: 74d71c6f-dd39-49ae-b674-6650e059b702
**Mode**: cloudflare-ops / deploy fix
**Date**: 2026-06-14T13:42:30Z
**Duration**: ~1 session

## Task Description
Production deploys via Cloudflare Workers Builds were failing with wrangler
code 10027 — the Worker exceeded the 3 MiB free-plan size limit. Brief: get
the bundle reliably under 3 MiB gzipped, or (fallback) walk through upgrading
to the Workers Paid plan. Constraint: no app behaviour changes; verify bundle
size from a clean build before and after.

## Actions Taken
- Read the failing CI build logs via the Cloudflare Workers Builds MCP.
  Confirmed code 10027; CI `handler.mjs` 15,844 KiB raw / 3,296 KiB gzip.
- Reproduced clean local builds (Node 22.22, `command rm -rf .next .open-next`,
  `opennextjs-cloudflare build`) and measured the real upload via
  `wrangler deploy --dry-run --outdir … --metafile`.
- Quantified suspects: stubbing `@anthropic-ai/sdk` out entirely saved only
  62 KiB gzip — not the cause. The bulk is the Next 16 server runtime.
- Identified the local↔CI gap (~242 KiB gzip) as Turbopack's native minifier
  differing between darwin-arm64 (local) and linux-x64 (CI).
- Tested `next build --webpack`: dropped the bundle from ~3.05 MiB to ~2.07–
  2.21 MiB gzip. Re-verified on the real `origin/main` tree (which had already
  dropped the SDK): 2,211 KiB gzip locally.
- Changed the `build` script to `next build --webpack`, rebased onto the real
  `origin/main` (local main was stale), `npm ci`, clean build, pushed to main.
- Monitored the triggered Workers Build to completion.

## Decisions Made
- **Switch `next build` to webpack instead of Turbopack.** Turbopack ships both
  the regular and experimental page runtimes plus full edge-runtime primitives
  and tree-shakes the server bundle far less aggressively. Webpack produces a
  ~986 KiB-smaller gzip bundle AND a consistent cross-platform minify (CI gzip
  2,228 KiB vs local 2,211 KiB — ~17 KiB gap, vs Turbopack's ~242 KiB). This is
  what makes it reliable rather than marginal.
- Did NOT pursue the Workers Paid upgrade — the free-plan path is now robust
  with ~843 KiB of headroom.
- No runtime/app code changed. Dev still uses Turbopack via `next dev`.

## Issues Encountered
- `rm` is aliased in the user's local shell, so `rm -rf …` in the deploy script
  silently no-ops locally (first reproduction build failed). Used `command rm`.
  CI uses plain `rm`, so CI is unaffected, but the script is non-portable.
- Local `main` was stale (be2effb); real `origin/main` was 10 commits ahead at
  3d5405f. Rebased the one-line fix onto it cleanly.

## Result
- Build `a8ccf194-1bc6-4b6b-b244-6f9c27a59564` (commit 38f874a) → **success**.
- `Total Upload: 10630.64 KiB / gzip: 2228.56 KiB` (limit 3,072 KiB).
- Deployed: https://blu-crm.kurtweiss.workers.dev — Version 55494087-f123-450e-8649-d97d76a9f4a0.

## Next Steps / Follow-ups (not blocking)
- The `deploy` script runs `opennextjs-cloudflare deploy`, then Workers Builds
  also runs its own deploy command (`npx wrangler deploy`), deploying twice per
  build. Harmless but wasteful — consider making the build command build-only.
- Consider `npx rimraf` / `command rm` in scripts for cross-shell portability.
- `--webpack` is a documented Next 16 flag but Turbopack is the long-term
  default; revisit if a future Next version restricts the webpack build path.

## Related Files
- package.json (build script)
