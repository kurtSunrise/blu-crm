# Blu Team Constitution

This document is the shared working agreement for contributors and AI agents in the Blu Shed repository. It should describe the project as it exists in the codebase today, not an aspirational stack from an earlier draft.

---

## Project Status

- **Product**: Blu CRM, a mobile-first CRM portal
- **Framework style**: Next.js App Router
- **Current backend direction**: Neon PostgreSQL with Drizzle ORM
- **Current auth direction**: Better Auth with a Drizzle adapter; route gating is not yet wired
- **Current UI direction**: touch-friendly, mobile-first, shadcn/ui-based interfaces
- **AI chat**: planned in product docs, not implemented in the current app code
- **Deployment**: Cloudflare Workers (worker name `blu-crm`) via `@opennextjs/cloudflare` + `wrangler`;
- **Photo storage**: Cloudflare R2 bucket `blu-crm-photos` bound as `PHOTO_BUCKET`; objects stay private and stream through `/api/attachments/[id]`. Local dev uses the simulated binding from `initOpenNextCloudflareForDev()` (persisted under `.wrangler/`)

---

## Technology Stack

### Core Technologies
- **Framework**: Next.js 16.2.6
- **Frontend**: React 19.2.4
- **Language**: TypeScript 5
- **Database**: Neon PostgreSQL via `@neondatabase/serverless`
- **ORM / Schema**: Drizzle ORM 0.45.2 with Drizzle Kit 0.31.10
- **Auth**: Better Auth 1.5.6 with Drizzle adapter
- **Styling**: Tailwind CSS 4
- **UI Components**: shadcn/ui with Base UI primitives where needed
- **State Management**: React state and App Router data flow; no dedicated global state library is part of the current stack
- **Vision / AI SDK**: `@anthropic-ai/sdk` for the photo-search vision provider; Z.AI is also wired as an alternate provider

### Testing & Quality
- **E2E Testing**: Playwright 1.59.1
- **Unit Testing**: not currently configured
- **Linting / Formatting**: Biome 2.4.9 via Ultracite
- **Type Checking**: Next.js production build and TypeScript checks

### Deployment Stack
- **Hosting**: Cloudflare Workers
- **Adapter**: `@opennextjs/cloudflare` 1.19.x (build = `npx opennextjs-cloudflare build`, deploy = `npx wrangler deploy` which auto-delegates to `opennextjs-cloudflare deploy`)
- **CLI**: `wrangler` 4.x (devDependency)
- **Config files**: `wrangler.jsonc` (worker name `blu-crm`) and `open-next.config.ts`
- **Photo storage**: Cloudflare R2 binding `PHOTO_BUCKET` → bucket `blu-crm-photos`; private objects served via the app's attachment route, no public bucket URL

### Development Tools
- **Package Manager**: npm
- **Version Control**: Git
- **Code Quality**: Ultracite

---

## Development Standards

### Code Quality Principles

1. **Type Safety First**
   - Use explicit types where they improve clarity.
   - Prefer `unknown` over `any` when a value is genuinely unknown.
   - Prefer narrowing over assertions.
   - Use descriptive names instead of magic values.

2. **Modern TypeScript and JavaScript**
   - Use `const` by default.
   - Prefer `for...of` over `.forEach()` when iteration logic is non-trivial.
   - Use optional chaining and nullish coalescing where appropriate.
   - Prefer template literals to string concatenation.
   - Keep functions focused and reduce nesting with early returns.

3. **React and App Router**
   - Use function components.
   - Keep hooks at the top level.
   - Respect App Router conventions for `page.tsx`, `layout.tsx`, and `route.ts`.
   - Prefer server-rendered routes by default and add `"use client"` only when interactivity requires it.
   - Do not define components inside other components unless there is a strong reason.

4. **Accessibility**
   - Use semantic HTML first.
   - Keep heading hierarchy meaningful.
   - Add labels for inputs.
   - Ensure keyboard access for interactive controls.
   - Preserve large touch targets for phone and tablet use on the workshop floor.

### Error Handling
- Throw `Error` objects with descriptive messages.
- Use `try/catch` only where errors are handled meaningfully.
- Prefer early returns for invalid states.
- Remove `console.log`, `debugger`, and `alert` from production code.

### Security
- Add `rel="noopener noreferrer"` to external links opened in a new tab.
- Avoid `dangerouslySetInnerHTML` unless there is a documented reason.
- Do not use `eval()` or write directly to `document.cookie`.
- Validate and sanitize user input before persistence.

### Performance
- Avoid unnecessary client-side state and effects.
- Avoid spread-heavy accumulator patterns in loops.
- Prefer specific imports over namespace imports.
- Avoid barrel files unless there is a clear module-boundary benefit.
- Use Next.js image optimization patterns when actual image rendering is introduced.

---

## Code Organization

### File Naming Conventions
- **App Router files**: use Next.js conventions such as `page.tsx`, `layout.tsx`, and `route.ts`.
- **Shared components**: use the repository’s current kebab-case pattern, for example `app-shell.tsx` and `stock-badge.tsx`.
- **Utilities and helpers**: use kebab-case or established local conventions, for example `auth-client.ts` and `dummy-data.ts`.
- **E2E tests**: use `.spec.ts`.
- **Do not introduce a second naming convention into an existing folder without a strong reason.**

### Directory Guidance
- `src/app/`: routes, layouts, and route handlers
- `src/components/`: reusable UI and app-shell components
- `src/components/ui/`: shadcn/ui and primitive wrappers
- `src/lib/`: auth clients, shared helpers, and temporary dummy data
- `src/db/`: database client and Drizzle schema
- `e2e/`: Playwright end-to-end tests
- `WorkLogs/`: shared work logs and team-level collaboration documents

### Data and Auth Conventions
- Keep the database schema in Drizzle, not Prisma.
- Treat Neon PostgreSQL as the database source of truth.
- Keep Better Auth configuration aligned with the Drizzle schema and DB client.
- Do not introduce SQLite-specific assumptions into new code or documentation.

---

## Testing Standards

### E2E Testing (Playwright)
- Playwright is the required framework for end-to-end browser testing in this repository.
- Critical user-facing flows should have Playwright coverage.
- Prioritize mobile and tablet behaviour because the product is used on phones and tablets in a workshop.
- Prefer assertions on visible behaviour and routing over implementation details.
- Use descriptive test names.
- Keep generated Playwright artifacts under `output/playwright/`.

### Unit Testing
- Unit test tooling is not currently configured.
- If unit tests are introduced later, document the framework explicitly before treating it as a project standard.
- Do not reference `npm test` in workflow docs until that script exists.

### Minimum Verification for Product Changes
- Run `npm exec -- ultracite check`
- Run `npm run build`
- Run `npm run test:e2e` when changing user-facing flows or navigation

---

## Documentation Standards

### Code Comments
- Prefer self-documenting code.
- Add comments for non-obvious logic and explain why a choice exists.
- Avoid noisy comments that restate the code.

### Project Documentation
- Keep `AGENTS.md`, `CLAUDE.md`, `PRD.md`, and `WorkLogs/TEAM_CONSTITUTION.md` aligned with the actual project state.
- When the stack or workflow changes, update the relevant docs in the same body of work.
- Do not document scripts or tools that do not exist in `package.json`.

---

## Development Workflow

### Branching
- `main` is the current default branch.
- Do not assume a `develop` branch exists.
- If feature branches are used, keep names short and descriptive.

### Commit Messages
- Prefer conventional commit-style subjects such as `feat`, `fix`, `docs`, `refactor`, `test`, or `chore`.
- Scope is optional but useful when the change is localized.

### Review Expectations
- Ensure the documented verification steps have passed for the kind of change being made.
- Call out unresolved risks, missing tests, or placeholder implementations clearly.
- Update documentation when workflow, tooling, or architecture changes.

### Pre-commit Checklist
- [ ] Code follows Ultracite standards: `npm exec -- ultracite check`
- [ ] Production build succeeds: `npm run build`
- [ ] Playwright passes for affected user-facing flows: `npm run test:e2e`
- [ ] Documentation is updated if the change affects workflow, architecture, or tooling

---

## Environment and Deployment

### Environment Variables
- Keep secrets in environment variables.
- Never commit `.env` files.
- Document required variables when adding new ones.

Runtime variables the current code reads:
- `DATABASE_URL` — Neon Postgres connection string. Required for any DB-touching path. A localhost/127.0.0.1 URL switches `src/db/index.ts` to the node-postgres (`pg`) driver so local development and E2E runs can use a plain local Postgres; Neon's HTTP driver is used everywhere else and remains the production path.
- `BETTER_AUTH_SECRET` — required by Better Auth at runtime; without it the library falls back to an insecure default and logs an error.
- `BETTER_AUTH_URL` — canonical deployed URL; needed for callbacks/redirects.
- `NEXT_PUBLIC_APP_URL` — `plain_text`; inlined into the client bundle (used by `src/lib/auth-client.ts` and QR code generation). Must be set at build time.
- `ANTHROPIC_API_KEY` and/or `ZAI_API_KEY` — only required if photo search is enabled.

### Core Commands
```bash
# Development
npm run dev

# Production build (next build only)
npm run build
npm start

# Cloudflare via OpenNext
npm run preview   # local Worker preview
npm run deploy    # opennextjs-cloudflare build && deploy

# Lint and format
npm exec -- ultracite check
npm exec -- ultracite fix

# End-to-end testing
npm run test:e2e
npm run test:e2e:headed

# Database
npm run db:push        # reads .env.local
npm run db:push:prod   # reads .env.production
npm run db:studio
```

---

## AI Agent Collaboration and Work Logging

### Purpose
This file also defines how AI agents should collaborate in the repository and record work in `WorkLogs/`.

### Before Starting Work
1. Read `WorkLogs/TEAM_CONSTITUTION.md`.
2. Check `WorkLogs/` for recent task logs before creating a new one.
3. Note overlapping work or dependencies before editing shared files.

### Work Log Requirements
Every AI-created work log must identify:
- **Agent Name / Model**
- **Session ID** if available
- **Timestamp** in ISO 8601 format
- **Mode / Role**

### Work Log Format
```markdown
# Work Log: [Task Title]

**Agent**: [Agent Name/Model]
**Session ID**: [Session Identifier or N/A]
**Mode**: [Mode/Role]
**Date**: [ISO 8601 Timestamp]
**Duration**: [Optional]

## Task Description
[Brief description]

## Actions Taken
- [Specific actions]

## Decisions Made
- [Technical decisions and rationale]

## Issues Encountered
- [Problems and resolutions]

## Next Steps
- [Follow-up actions]

## Related Files
- [Files referenced or changed]
```

### Work Log File Naming
Use:

```text
[YYYY-MM-DD]_[agent-name]_[task-name].md
```

Example:

```text
2026-04-02_codex_team-constitution-reconciliation.md
```

### Collaboration Rules
1. Read before write.
2. Reference related logs when continuing earlier work.
3. Record blockers, assumptions, and handoff details clearly.
4. If work is incomplete and intended for handoff, note that explicitly in the log.

---

## Constitution Maintenance

- Update this document when the implemented stack, scripts, or workflow change.
- Prefer small, accurate corrections over broad aspirational edits.
- If this file conflicts with the codebase, fix the file promptly.
