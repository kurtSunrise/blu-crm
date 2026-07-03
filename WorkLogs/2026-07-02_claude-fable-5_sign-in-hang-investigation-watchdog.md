# Work Log: Sign-in Hang Investigation and Watchdog Mitigation

**Agent**: claude-fable-5
**Session ID**: 3d42909c-16c2-4fb3-85d2-2292b011df93
**Mode**: Incident investigation + mitigation (direct implementation)
**Date**: 2026-07-02T21:30:00+08:00 (approximate)

## Task Description

Root-cause the "cookieless getSession hang" documented in TEAM_CONSTITUTION Known Runtime Issues (logged-out `/` and `/sign-in` hang forever on the deployed Worker). Triggered when Kurt could not log in to verify the reports deploy.

## Actions Taken

- Reproduced the hang on prod (`/sign-in` and `/` cookieless: 0 bytes after 45 s), while `/reports` 307'd fast and `/enquire` (static) was fine.
- Built and ran a local Cloudflare preview (`npm run preview`, new `.dev.vars` from dev env, gitignored): the hang does NOT reproduce on local workerd. All routes fast.
- Read the better-auth 1.6.15 getSession source: with no session cookie it returns null WITHOUT any database query, eliminating Neon cold-start for the cookieless path.
- Deployed an instrumented build (versions ac5a745c): `[auth-debug]` timing marks in `src/lib/session.ts`, `src/lib/auth.ts`, `src/db/index.ts`, and `src/app/(public)/sign-in/page.tsx`. Warm-path logs confirmed: full sequence, all +0 ms, no DB call.
- Queried Workers observability history (`POST /accounts/{id}/workers/observability/telemetry/query`) for canceled invocations and reconstructed the 2026-07-02 08:21-09:00 UTC incident minute by minute.
- Ran live probes: 15-min-idle probe and a 24-request concurrent burst - neither reproduced the hang on demand. Armed a persistent 5-minute probe monitor.
- Shipped the mitigation: `worker-entry.mjs` wrapping the OpenNext worker (wrangler `main` repointed; Durable Object classes re-exported). GET/HEAD requests with no Response after 12 s are logged (`[hang-watchdog]`) and retried once, unraced. Verified on preview (GET/redirect/static/POST-passthrough) and on prod (version c7bc05ab).
- Updated TEAM_CONSTITUTION Known Runtime Issues with the corrected findings.

## Findings (supersede the old theory)

- The hang is NOT cookieless-specific, NOT getSession, NOT the database, NOT cold-start. In the incident window, signed-in `/reports` and `/calendar` requests hung interleaved with identical requests that succeeded seconds apart. One `/calendar` invocation ran 38.7 minutes (wallTime 2,322,487 ms) until the browser closed; all hung requests were canceled together at 09:00:04 when the client disconnected.
- Signature: ~20-100 ms CPU consumed (a successful sign-in render costs ~550 ms), then the fetch promise never settles; no headers, no exception, outcome `canceled` plus the waitUntil warning.
- Points at the Next 16 / OpenNext / workerd streaming layer, per-request and intermittent. Not reproducible locally. Consistent with mid-June 2026 workerd streaming regressions (workerd#6832 is a sibling regression in that area; opennextjs-cloudflare#1282 and #1287 report similar unresolved production hangs). The constitution first recorded the hang on Jun 17, matching that window.
- Adapter upgrade 1.19.11 -> 1.20.1 contains no relevant fixes (changelog reviewed), so no upgrade was performed.

## Decisions Made

- Mitigate rather than wait for upstream: the watchdog converts an infinite hang into a ~12 s + retry, bounded to GET/HEAD so no side effects are ever duplicated. The retry is not raced against a timer, so a legitimately slow response (e.g. Neon cold wake, up to ~21 s with the resilient fetch retries) is never cut off; the wrapper can only add one deadline of delay.
- Kept the `[auth-debug]` instrumentation live deliberately (contra the no-console rule, with comments): the next natural occurrence will show exactly where execution stops, deciding app-code vs streaming-layer conclusively. Remove with the watchdog once fixed upstream.
- biome-ignore on the DO re-export in worker-entry.mjs: wrangler requires Durable Object classes exported from `main`.

## Issues Encountered

- `npm run deploy | tail -5` masked a populate-cache failure and its exit code (pipeline exit = tail's); a Google Fonts fetch flake also failed one build. Deploys are now run with full log capture.
- `wrangler tail` output is block-buffered through pipes and the session disconnects after ~10 minutes; the observability query API is the reliable way to inspect past invocations.
- Background shells intermittently lose PATH (`curl`/`date` not found); absolute paths (`/usr/bin/curl`, `/bin/date`) are required in probe scripts.

## Next Steps

- When the next hang occurs (probe monitor armed; `[hang-watchdog]` logs count catches), pull the request's `[auth-debug]` trail from observability to finalise the upstream bug report against opennextjs-cloudflare/workerd.
- Consider filing the upstream issue proactively with the incident timeline data.
- Remove `worker-entry.mjs` watchdog + `[auth-debug]` marks once fixed upstream.
- `.dev.vars` (gitignored) now exists for local preview runs; keep secrets out of git.

## Related Files

- `worker-entry.mjs` (new)
- `wrangler.jsonc` (main repointed)
- `src/lib/session.ts`, `src/lib/auth.ts`, `src/db/index.ts`, `src/app/(public)/sign-in/page.tsx` (temporary instrumentation)
- `.gitignore` (+.dev.vars)
- `WorkLogs/TEAM_CONSTITUTION.md` (Known Runtime Issues corrected)
- Related prior log: `2026-07-02_claude-fable-5_reports-best-in-class-phase1-2.md` (the deploy that prompted the login attempt)
