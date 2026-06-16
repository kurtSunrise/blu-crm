# Work Log: Avatar-menu crash fix, __name polyfill, nav/theme UX, and admin team management

**Agent**: Claude Code (claude-opus-4-8)
**Session ID**: N/A
**Mode**: Implementation (bug fix + auth/feature work + deploy)
**Date**: 2026-06-16T00:00:00Z

## Task Description

A connected set of fixes and features on the Blu CRM app (Next.js 16 +
`@opennextjs/cloudflare` on Cloudflare Workers, deployed at
https://blu-crm.kurt-0f6.workers.dev; live DB is the `.env.local` Neon):

1. Diagnose and fix a reported "broken page" when using the avatar dropdown.
2. Remove the redundant sidebar "Settings" entry.
3. Fix a production `__name is not defined` console error.
4. Navigation/theme UX: move theme toggle into the avatar dropdown; add the
   avatar dropdown to the mobile header.
5. Promote Kurt Weiss to `admin`.
6. Build an admin-only "manage team members" feature.

This continues the settings/avatar work from
`2026-06-15_claude-code_settings-shell-and-account-page.md` (commit `ea5556e`),
which introduced the regression fixed in item 1.

## Actions Taken

- **Avatar dropdown crash (commit `47a3827`, deployed).** Diagnosis chain: the
  user was testing the deployed Worker; "This page couldn't load" is Next.js
  16's built-in global error boundary; `wrangler tail` showed the server
  returned OK, so the crash was client-side; the browser console showed Base UI
  error #31, decoded (from the base-ui repo's `docs/src/error-codes.json` at tag
  v1.5.0) as "MenuGroupContext is missing. Menu group parts must be used within
  `<Menu.Group>` or `<Menu.RadioGroup>`." Root cause: `sidebar-user-menu.tsx`
  rendered `DropdownMenuLabel` (Base UI `Menu.GroupLabel`) with no surrounding
  group, throwing the moment the menu content rendered. Fix: wrapped the label
  in `DropdownMenuGroup`.
- **Removed redundant sidebar "Settings" entry** from the secondary nav in
  `app-shell.tsx`, since Settings is reachable from the avatar dropdown
  (commit `de55c60`, deployed).
- **`__name is not defined` fix (commit `5169af6`, deployed).** Root cause:
  OpenNext's esbuild bundles `next-themes` with `keepNames`, so the bootstrap
  function `next-themes` inlines via `fn.toString()` contains `__name(...)`
  calls, but `__name` is not defined in the inline `<script>` scope. Fix: emit a
  global `__name` identity polyfill from the ThemeProvider CLIENT component
  (`theme-provider.tsx`) via `dangerouslySetInnerHTML`, placed before
  `NextThemesProvider` — the same emission path `next-themes` itself uses, which
  React 19 does emit into SSR HTML. Verified in the prerendered build output and
  on the live site that the polyfill renders before the next-themes script.
- **Nav/theme UX (commit `c526f70`, deployed).** Moved the light/dark theme
  toggle into the avatar dropdown (`sidebar-user-menu.tsx`) for desktop and
  mobile (menu kept open on click). Added the avatar dropdown to the mobile
  header (right side, opens downward via a new `menuSide` prop), replacing the
  standalone theme button and sign-out button in `app-shell.tsx`. Updated
  `e2e/auth.spec.ts` (sign-out now goes through the avatar menu's "Log out") and
  `e2e/help-and-theme.spec.ts` (theme toggle driven through the menu).
- **Promoted Kurt Weiss** (`kurt@blu.builders`) from `sales` to `admin` via a
  one-off DB update against the live Neon DB, then removed the throwaway script
  and updated `src/db/seed.ts` so a re-seed stays consistent (commit `e130624`).
- **Admin-only team management (commit `0cc7df6`, deployed; version
  `f608e8f5`).** Delegated to the data-layer and crm-ui sub-agents:
  - Schema: added `user.disabled` (boolean, default false); pushed to live Neon
    via `npm run db:push` (non-destructive).
  - Auth (`src/lib/auth.ts`): `disabled` exposed as a Better Auth
    `additionalField`; a `databaseHooks.session.create.before` hook blocks
    disabled users from signing in.
  - `src/lib/session.ts`: added `requireAdmin()`; `getSession` treats a disabled
    user as signed out (defense in depth).
  - `src/lib/actions/team-actions.ts` (new): `addTeamMember`, `setMemberRole`,
    `setMemberDisabled` — all admin-enforced, returning
    `{ ok: true } | { ok: false; error }`.
  - UI: `src/app/(app)/settings/team/page.tsx`,
    `src/components/team/team-members.tsx`,
    `src/components/team/add-member-dialog.tsx` — admins get an Add-member dialog
    and per-row role + disable/enable controls; non-admins keep the read-only
    list.

## Decisions Made

- **Avatar fix scoped to the missing group wrapper**, not a refactor of the menu;
  the crash was a strict Base UI contract violation, so the minimal correct fix
  is wrapping the label in `DropdownMenuGroup`.
- **`__name` polyfill emitted from the client ThemeProvider, not the root
  layout.** Two earlier attempts (commits `20647bc`, `8d38e51`) were reverted
  (`524eecf`) because they injected the polyfill from the root layout (a server
  component / `next/script`), which React 19 did not emit into the SSR HTML.
  Routing the polyfill through the same client-component path next-themes uses is
  what makes it actually render.
- **"Remove" is a soft-disable, not a hard delete.** `deal.ownerId` /
  `created_by` / `updated_by` / `uploaded_by` reference `user.id` without
  cascade, so deleting an active user would violate FKs and destroy history.
  Disabling revokes the target's sessions instead.
- **New members created as credential accounts directly** (mirrors `seed.ts`) so
  the acting admin's session is untouched (vs. using a sign-up call that would
  swap the current session).
- **Safety guards in team actions**: cannot demote or disable the last active
  admin, and cannot disable yourself.
- **`user.role` was display-only before this session** (not enforced); the new
  `requireAdmin()` + action guards are what actually enforce admin access.

## Issues Encountered

- **Could not verify the signed-in UI by clicking through a browser.** The
  connected-browser tooling was unavailable, and the local E2E suite can't sign
  in in this environment because the seed password isn't set — `global-setup`
  returns 401. Recorded honestly below.

## Verification status

- All changes are lint-clean (`ultracite`) and type-clean (`tsc --noEmit`).
- The `__name` fix and the route guarding were verified against the live site.
- The Base UI #31 fix was verified at the source level (decoded error code +
  Base UI Menu group contract), not by clicking the menu in a browser.
- NOT verified by clicking through the signed-in UI in a browser (see Issues).
  The original avatar regression escaped E2E because the suite never opens that
  menu.

## Next Steps

- **User to manually test the signed-in flows**: avatar menu, mobile header,
  theme toggle, and the team add / role / disable actions.
- **Email-invite flow for new members**: members are currently created with
  email+password only; a real invite flow would require standing up Cloudflare
  Email Service (open follow-up).
- The "Duplicate key options" esbuild warning during deploy is a benign upstream
  (floating-ui) warning; no action needed.
- Consider adding E2E coverage that opens the avatar menu, to catch a repeat of
  the #31 regression.

## Related Files

- `src/components/sidebar-user-menu.tsx`
- `src/components/app-shell.tsx`
- `src/components/theme-provider.tsx`
- `src/lib/auth.ts`, `src/lib/session.ts`
- `src/lib/actions/team-actions.ts` (new)
- `src/db/seed.ts`, `src/db/schema.ts` (user.disabled)
- `src/app/(app)/settings/team/page.tsx`
- `src/components/team/team-members.tsx`, `src/components/team/add-member-dialog.tsx`
- `e2e/auth.spec.ts`, `e2e/help-and-theme.spec.ts`
