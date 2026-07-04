# Work Log: Best-in-Class Contacts UI, Phase 1

**Agent**: Claude Fable 5 (Claude Code)
**Session ID**: 18f9e3d9-a7e0-4f81-9863-116d48179d82
**Mode**: Implementation (plan approved by user)
**Date**: 2026-07-04T00:00:00+08:00 (work spanned 2026-07-03 to 2026-07-04 AWST)

## Task Description

Phase 1 of the "best-in-class contacts UI" overhaul of `/contacts`, driven
by competitor analysis (Attio, folk, HubSpot, Pipedrive, Copper, Linear).
Zero schema changes. The full plan, including a documented Phase 2 backlog
(contact tags, saved views, peek panel via intercepting route, bulk
actions), lives at `~/.claude/plans/what-need-to-change-fluffy-widget.md`;
Phase 2 is planned, not implemented.

Continues the original directory build from
`2026-06-11_claude-code_contacts-best-in-class.md` and touches the e2e
test added by
`2026-07-02_claude-sonnet-5_deal-value-range-and-contact-lookup.md`
(see Decisions and Issues below).

## Actions Taken

- **NEW `src/lib/contacts-directory-data.ts`**:
  `getContactsDirectoryData()` runs 7 parallel aggregate queries:
  people base; per-contact deal rollup with `openDeals`,
  `openValueCents`, and `topOpenStage` via `array_agg` on stage
  position; `ownerName` of the most recent open deal; max
  `deal.lastContactAt`; last-touch activity per contact restricted to
  call/email/site_visit/meeting types via
  `coalesce(activity.contact_id, deal.contact_id)`; min incomplete
  `follow_up.dueDate` per contact; plus the two existing company
  rollups. Results merged in JS; dates serialized to ISO. Replaced the
  inline fan-out-prone groupBy join in `page.tsx`.
- **REWROTE `src/components/contacts-directory.tsx`**: sticky toolbar
  (search + quick-filter pills All / Open deals / Follow-up due /
  No touch 30d+ + sort Name / Recently contacted / Open value) in a
  single horizontally scrollable row. Results status line
  (`role="status"`, "X people · Y companies match") used as the e2e
  hydration signal. People/Companies segmented toggle below `lg`
  (fieldset); two-column layout kept at `lg`+. Filter/sort/view state
  initialized from `useSearchParams` and synced via
  `window.history.replaceState` (shallow, no server round-trip; search
  debounced 250ms). In-memory filtering preserved.
- **NEW `src/components/contact-card.tsx`**: two-row card. Top row:
  avatar + name + title · company + quick actions (Call `tel:`, NEW
  Text `sms:`, Email `mailto:`, 44px each, sibling anchors). Bottom
  row: full-width meta (last-contacted via `formatRelativeDayAwst`,
  amber Follow-up due pill from `SUB_STATUS_PALETTE`, top open stage
  `Badge`, "N open · $X", owner first name right-aligned).
- **NEW `src/components/contact-avatar.tsx`**: deterministic initials
  avatar over `ui/avatar.tsx`, punctuation-stripped initials, literal
  Tailwind palette excluding brand blu/green. Amber uses
  `text-amber-800` in light mode (amber-700 failed WCAG AA on the
  light fill, caught by the axe e2e run).
- **UPDATED `src/app/(app)/contacts/page.tsx`** to use the new data
  module, and `loading.tsx` to mirror the new layout.
- **NEW `e2e/contacts-helpers.ts`**: `fillContactsSearch` now keyed on
  the status line; also exports `resultsStatus`,
  `openCompaniesSection`, and `COMPANIES_TOGGLE_NAME`.
- **UPDATED `e2e/contacts.spec.ts`** to use the helpers, plus 5 new
  tests: open-deals pill + stage chip; sms/tel/mailto row actions;
  recently-contacted sort after quick-logging a call; mobile
  People/Companies toggle; plus updates to existing tests.
- **UPDATED `e2e/companies.spec.ts`**: the archived-company assertion
  now uses the status line.
- **HARDENED** the pre-existing test "selecting an existing contact
  locks phone/email..." (added in the 2026-07-02 deal-value-range
  work) with the clear-then-fill `toPass` loop from
  `companies.spec`. It was failing deterministically on tablet WebKit
  (single `fill()` before hydration).

## Decisions Made

- **Parallel small aggregates over one mega-join**: follows the
  deal-page 503 lesson (sequential/heavy queries on workerd) and keeps
  each query reviewable.
- **`history.replaceState` over `router.replace`** for filter URL
  state: the page is force-dynamic, so `router.replace` would trigger
  a server refetch on every pill tap.
- **Derived owner and derived lastContactAt instead of schema
  columns**: owner = most recently updated open deal; "touch" =
  call/email/site_visit/meeting only, mirroring what stamps
  `deal.lastContactAt`. Stage changes and notes do not count as a
  touch.
- **Companies demoted behind a toggle on <`lg`, not removed**:
  `companies.spec` and existing workflows depend on the companies
  list.
- **Contacts kept OUT of the mobile bottom tab bar**: this preserves
  an existing deliberate decision; the user was unavailable when
  asked, so the conservative default was chosen.
- **URL-synced filter state supersedes** the 2026-07-02 log's "keep
  filter client-side" note only insofar as adding URL state; filtering
  itself remains client-side and in-memory.

## Issues Encountered

- **New e2e test bug**: filling the deal-form contact combobox last
  leaves its dropdown overlaying the Add lead button. Fixed by filling
  Email after the combobox, matching the existing tests.
- **One transient global-setup sweep failure**: `deal_stage_event` FK
  race on the shared Neon e2e branch. Cleared by
  `scripts/clean-e2e-data.ts` and did not recur.
- **Environment noise during a 2-hour phone+desktop run**: the user
  restarted the dev server mid-run; reports-page a11y failures belong
  to the separate uncommitted reports work stream (see
  `2026-07-02_claude-fable-5_reports-best-in-class-phase1-2.md`); the
  calendar contrast failure is a known pre-existing failure.
- **axe caught two real light-mode contrast violations in the new
  UI**: a `muted-foreground/70` label and `amber-700` avatar text.
  Both fixed and re-verified.

## Verification

- `npm exec -- ultracite check`: clean.
- `npm run build`: passed (typecheck included; final build re-run at
  the end of the session).
- Playwright: `contacts.spec` + `companies.spec` 29/29 passed on
  phone+desktop. Accessibility contacts light+dark 2/2 passed on
  desktop. Tablet (`--workers=1`) 13/15 on first pass; both failures
  resolved (one flake passed on retry, one deterministic WebKit fill
  race fixed by the hardening above); the hardened test passed on
  tablet.
- Visual verification via Playwright screenshots at Pixel 7 and
  desktop viewports: sticky toolbar, avatars, meta rows, and toggle
  all correct. Two layout defects were found and fixed this way
  (meta/action-button collision, "B(" initials).

## Next Steps

- **Phase 2 backlog** (tags, saved views, peek panel, bulk actions) is
  documented in the plan file. Tags come first and will require schema
  push discipline: dev push, verify, then prod push before deploy.
- **Not yet deployed to prod** (`npm run deploy`): deploy only on user
  request.
- **Handoff note**: uncommitted changes from the separate reports work
  stream are still in the tree; commit the contacts files separately.

## Related Files

- `src/lib/contacts-directory-data.ts` (new)
- `src/components/contacts-directory.tsx` (rewritten)
- `src/components/contact-card.tsx` (new)
- `src/components/contact-avatar.tsx` (new)
- `src/app/(app)/contacts/page.tsx`
- `src/app/(app)/contacts/loading.tsx`
- `e2e/contacts-helpers.ts` (new)
- `e2e/contacts.spec.ts`
- `e2e/companies.spec.ts`
- `~/.claude/plans/what-need-to-change-fluffy-widget.md` (plan, Phase 2 backlog)
- Related prior logs:
  `2026-06-11_claude-code_contacts-best-in-class.md` (original
  directory build),
  `2026-07-02_claude-sonnet-5_deal-value-range-and-contact-lookup.md`
  (added the e2e test hardened here; its client-side-filter decision
  is refined, not reversed)
