# Work Log: Parallel page queries + Neon ETIMEDOUT root-cause fix

**Agent**: Claude Code (Fable 5)
**Session ID**: N/A
**Mode**: Performance investigation and fix
**Date**: 2026-06-10T00:00:00+08:00

## Task Description

User reported the site feels slow and hit intermittent "Failed query"
runtime errors on the dashboard. Investigated, parallelised page queries,
and root-caused the intermittent Neon connection failures.

## Actions Taken

- Measured page loads: dashboard ~2.9s, tasks 1.0–3.4s, inbox ~1.3s,
  reports ~1.0s; a route with no DB access loads in ~0.12s. Each Neon HTTP
  query is a ~70–340ms round-trip and pages ran them sequentially.
- Batched independent queries with `Promise.all`:
  - `src/app/(app)/page.tsx` — 6 round-trips → 2
  - `src/app/(app)/tasks/page.tsx` — 5 → 2
  - `src/app/(app)/inbox/page.tsx` — 2 → 1
  - `src/app/(app)/reports/page.tsx` — 3 → 1
- Re-measured: dashboard 2.9s → ~0.9s; tasks stable ~0.88s.
- Parallel queries made the pre-existing "Failed query" flake frequent.
  Root-caused it: Neon publishes AAAA records, this machine has no working
  IPv6 path to them, and Node ≥20's Happy Eyeballs (`autoSelectFamily`)
  times out fresh socket connects with bare `ETIMEDOUT` — 20/20 concurrent
  connects failed with it on, 20/20 succeeded with it off.
- Fixed in `src/db/index.ts`: `setDefaultAutoSelectFamily(false)` guarded
  to the Node runtime (workerd/Cloudflare is unaffected and may not
  implement the API).
- Verified: `ultracite check` clean, `npm run build` passes, smoke spec
  passes, home page renders correctly in headless Chromium 3/3.

## Decisions Made

- Two `Promise.all` batches per page rather than one: stale/closing-soon
  lookups need the thresholds row first; the tasks follow-up query needs
  the user list to validate the owner filter.
- Disabled `autoSelectFamily` globally in the Node runtime rather than
  patching the fetch used by the Neon driver — the failure is at socket
  connect, affects any outbound fetch from the dev server, and the flag is
  a no-op where IPv6 works.

## Issues Encountered

- Mid-verification the machine's whole internet connection degraded
  (cloudflare.com 15s, TCP connects to Neon 1.8–13s, single queries
  1–10s). Targeted e2e runs (`reports`, `alerts`, `follow-ups`) failed
  with 30s navigation timeouts because of this, not because of the code
  changes — pages all return 200 with correct content. Re-run when the
  network is healthy: earlier in this same session the smoke spec passed
  and `2026-06-10_claude-code_m5-reports.md` notes these specs passed as
  a group this morning.
- Reconfirmed the `m5-reports` log's observation that full-parallel e2e
  against remote Neon saturates the dev server (27 tests × 3 projects);
  a local Postgres for e2e remains the right long-term fix.

## Next Steps

- Re-run `npx playwright test reports.spec.ts alerts.spec.ts
  follow-ups.spec.ts smoke.spec.ts` once the network recovers.
- Consider a local Postgres for e2e (also re-enables the global-setup
  data wipe, which is skipped for remote hosts).

## Related Files

- `src/app/(app)/page.tsx`
- `src/app/(app)/tasks/page.tsx`
- `src/app/(app)/inbox/page.tsx`
- `src/app/(app)/reports/page.tsx`
- `src/db/index.ts`
