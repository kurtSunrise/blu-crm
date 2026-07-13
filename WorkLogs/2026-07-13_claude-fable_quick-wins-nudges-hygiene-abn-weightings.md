# Work Log: Quick Wins — Nudge Automations, Hygiene Briefing, ABN Lookup, Weighting Hints

**Agent**: Claude Code (Claude Fable 5, claude-fable-5)
**Session ID**: f378e3a4-429d-4862-bef5-f6acc0ce8d66
**Mode**: Implementation (plan approved by Kurt)
**Date**: 2026-07-13T00:00:00+08:00

## Task Description

Implement the four quick wins Kurt approved from the competitive gap analysis
(`COMPETITIVE_GAP_ANALYSIS.md`, repo root):

1. **Quote awaiting response nudge** and **stage-entry follow-up automation**,
   both admin-configurable under Settings → Alerts & automations.
2. **Data-hygiene section** in the Tue-Fri morning briefing.
3. **ABN lookup** (Australian Business Register) on the company form, with new
   `company.abn` / `company.legal_name` columns.
4. **Actual-conversion hints** beside the stage weighting inputs in Settings.

Explicitly out of scope per Kurt: quote accept/decline (Xero owns acceptance),
the M1-M9 metrics page, email/calendar sync (blocked on stakeholders and IT).

## Actions Taken

- `src/lib/alerts.ts`: new setting keys + readers `getQuoteNudgeConfig`,
  `getAutoFollowUpConfig`; new queries `getQuotesAwaitingResponse` (shared by
  sweep + briefing) and `getDealsMissingKeyFields`.
- `src/lib/validation/settings.ts`, `src/lib/actions/settings-actions.ts`,
  `src/components/alert-thresholds-form.tsx`, `src/app/(app)/settings/page.tsx`:
  four new settings (quote nudge on/off + days, automation stage + due days) in
  the existing alert-thresholds form; the action validates the automation stage
  is a real open stage. Settings page reads now fan out with `Promise.all`.
- `src/lib/notification-types.ts`: new `quote_no_response` type (registry +
  order + preferences UI copy).
- `src/lib/notification-sweeps.ts` + `src/app/api/cron/notifications/route.ts`:
  `sweepQuoteNoResponseNudges` on the daily cron; dedupe key anchors on
  `quoteId:sentAt` so a re-sent quote starts a fresh episode. Predicate counts
  `sent` AND `viewed` quotes with `responded_at IS NULL` (a viewed-but-silent
  quote is exactly the one to chase; slightly wider than the plan's
  `status='sent'`, deliberate).
- `src/lib/mutations/follow-up.ts` + `src/lib/actions/deal-actions.ts`:
  `maybeCreateStageEntryFollowUp` hooked into `moveDealStageForUser` after the
  stage-event insert (covers the kanban drag AND the AI `move_deal_stage` tool,
  which calls the same action); skips when any open follow-up exists; owner
  falls back to the mover; failures log `[auto-follow-up]` and never break the
  move.
- `src/lib/ai/proactive.ts` + `src/lib/duplicates.ts`: briefing hygiene section
  (per-owner data-gap deals as a "Data gaps" artifact card, quotes awaiting
  response, org-wide contacts-without-company and duplicate-contact-group
  counts via new `countDuplicateContactGroups`). Personal hygiene items count
  toward the "does this member get a briefing" check; org-wide counts only ride
  along.
- `src/db/schema.ts`: `company.abn`, `company.legal_name` (nullable text).
  Pushed to dev (`db:pgvector` then `db:push`).
- `src/app/api/abn-lookup/route.ts`: session-gated proxy for the ABR JSON web
  services (JSONP unwrap; ABN details or name search; needs new `ABR_GUID` env
  var, 503 when unset). `global_fetch_strictly_public` does not affect external
  APIs.
- `src/components/company-edit-form.tsx`, company edit/view pages,
  `src/lib/validation/company.ts`, `src/lib/actions/company-actions.ts`: ABN +
  legal name fields, Look up button (single match auto-fills; multiple matches
  render a pick list), ABN validated as 11 digits with spaces tolerated.
- `src/components/stage-weightings-form.tsx` + settings page: per-stage
  "actual conversion" hints from `getFunnelConversion` over a 12-month cohort,
  with a small-sample caveat under 20 deals.
- Docs: CLAUDE.md env table + API list, constitution env list, Help "What's
  New" entry (13/07/2026).

## Decisions Made

- Quote nudge counts `viewed` quotes as still awaiting response; `quote_viewed`
  remains its own instant alert.
- Automation stage select offers open stages only; Won/Lost cannot trigger it.
- Briefing org-wide hygiene lines never force a briefing on their own; only a
  member's personal items (follow-ups, closing, stale, data gaps, waiting
  quotes) do.
- The Won terminal funnel step has no `stageId`, so the Won stage row shows no
  hint; open stages only.

## Issues Encountered

- Biome complexity budget (21 > 20) on `moveDealStageForUser` after adding the
  automation try/catch; resolved by extracting `runStageEntryAutomation`.
- Dev-DB exercise revealed `auto_follow_up_days` can persist as 0 while the
  automation is off (disabled inputs are absent from FormData, coerced to 0);
  same pre-existing behaviour as `staleNudgeRepeatDays`, harmless because the
  value is ignored while off.

## Verification

- `npm exec -- ultracite check` clean; `npm run build` clean.
- Dev-DB exercise script (temporary, removed): config readers return defaults;
  `sweepQuoteNoResponseNudges` inserted 1 nudge for a real quiet dev quote on
  run 1 and 0 on run 2 (dedupe proven).
- Targeted Playwright run (settings, companies, alerts, pipeline, quotes,
  ai-proactive across phone/tablet/desktop): 52 passed, 14 failed, ALL
  failures triaged as pre-existing or known flake:
  - `settings.spec` tests 1-2 (all projects): stale tests expecting the old
    single-page settings ("Lead intake"/"Data"/"Workspace" sections moved to
    sub-pages); documented pre-existing failures.
  - `settings.spec` AI-instructions persistence (desktop): state pollution on
    the shared e2e DB (two runs' values concatenated); unrelated surface.
  - tablet-only pipeline/quotes/ai-proactive failures: known WebKit tablet
    flake (each passes on phone and desktop).
  - `companies.spec` archive test (all projects): a REAL pre-existing bug from
    commit 6c0fb87: `archiveCompany` redirected to `/companies?flash=...` but
    no /companies index route exists, landing users on a 404 after archiving.
    Fixed in this change (redirect to `/contacts?flash=company-archived`,
    where ToastFlash in the (app) layout shows the toast). After the fix, all
    5 companies tests pass on desktop, including the archive flow and the
    company edit form with the new ABN fields.

## Next Steps

- Register for the free ABR GUID (abr.business.gov.au → web services) and set
  `ABR_GUID` in `.env.local` and as a prod secret (`wrangler secret put`).
- Prod rollout order: `npm run db:pgvector:prod` (no-op if present) →
  `npm run db:push:prod` (company columns) → `wrangler secret put ABR_GUID` →
  check `df -h /` → `npm run deploy` → cache-busted live verification.
- Consider surfacing the auto-created follow-up in the stage-move toast.

## Related Files

- `COMPETITIVE_GAP_ANALYSIS.md` (analysis this work implements)
- All files listed under Actions Taken
