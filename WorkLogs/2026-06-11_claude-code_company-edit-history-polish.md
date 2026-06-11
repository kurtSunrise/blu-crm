# Work Log: Company Edit/Archive + Contact History Polish

**Agent**: Claude Code (Fable 5, claude-fable-5)
**Session ID**: cse_01WsDKrW9UJW7aBbMFBca1nW
**Mode**: Implementation (autonomous)
**Date**: 2026-06-11T16:00:00+08:00
**Duration**: ~1.5 hours

## Task Description

User: "continue" after the contacts area merge, then mid-task feedback
that the contact page's logs UI lagged behind the deal page's timeline.
Delivered the flagged follow-up (company editing) plus the history
restyle.

## Actions Taken

- **Company edit** (`/companies/[id]/edit`, new): name, kind (select of
  the five PRD kinds: brand / agency / venue / shopping centre / referral
  partner), website, notes. `updateCompany` server action with the
  echo-back state pattern; `archiveCompany` soft delete. New
  `updateCompanySchema` in `src/lib/validation/company.ts`.
- **Company page**: Edit quick action in the header; Archive company at
  the bottom.
- **Generic archive button**: `archive-record-button.tsx` replaces the
  contact-specific component; server components bind the record via
  `action.bind(null, id)`. Contact page refactored onto it,
  `archive-contact-button.tsx` deleted. Labels unchanged, so existing
  specs held.
- **Contact history restyle** (user feedback that the contact logs UI
  lagged the deal page): a parallel session shipped a rail-style
  `deal-timeline.tsx` and a shared `NativeSelect` to main mid-task, so
  after merging, the contact History now renders through the shared
  `DealTimeline` (extended additively: optional per-entry context link,
  since a contact's history spans deals, and a configurable footer label,
  "Contact added" here). The company kind select and the parallel
  session's stage-manager sweep both use `NativeSelect`. Query joins
  user (author) and deal (title); contact `createdAt` feeds the footer.
- **E2E**: new `companies.spec.ts` (edit with kind/website assertions;
  archive removes from directory). 129/129 passing; lint and build clean.

## Decisions Made

- Company kind is a select of the PRD's five kinds but validated
  leniently server-side, since the column is free text.
- One generic ArchiveRecordButton over per-record components: identical
  UX, less code, and bound server actions keep the client dumb.
- `DealTimeline` was extended additively (optional props with defaults)
  rather than renamed/forked, to keep the collision surface with the
  parallel session minimal. Renaming it to ActivityTimeline is a clean
  follow-up once no other session is active on it.

## Issues Encountered

- Strict-mode locator collision: "Edit" matched the "Editable Person"
  card link on the company page; fixed with `exact: true`.
- The pipeline board applies stage moves optimistically, so the
  stage-management reassign test could reach /settings before the write
  landed (deal count 0, no reassign select). Fixed by retrying the
  goto + open-panel sequence until the server-side count shows the deal.
  `openPanel` also now guards on visibility so a retry never toggles an
  already-open panel shut.
- The dev server bloats to ~3.5GB RSS after a few full E2E runs and
  starts timing out tablet (WebKit) tests on this 4-core container.
  Restarting `next dev` restores a clean run; killed by literal PID
  because pattern-based pkill matches the invoking shell itself.

## Next Steps

- Auth remains the parked milestone (claude/auth-parked).
- M4 AI assistant (US-18 one-tap client summary fits the contact page).

## Related Files

- src/app/(app)/companies/[id]/page.tsx, edit/* (new)
- src/components/company-edit-form.tsx, archive-record-button.tsx (new),
  archive-contact-button.tsx (deleted)
- src/lib/actions/company-actions.ts, src/lib/validation/company.ts (new)
- src/app/(app)/contacts/[id]/page.tsx (history restyle, shared archive)
- e2e/companies.spec.ts (new), e2e/stage-management.spec.ts
