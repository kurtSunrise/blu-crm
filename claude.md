# Blu Shed — Workshop Inventory Portal

## Project Overview

**Blu CMS** is a mobile-first web portal for Blu Builders to operate as a CRM (Customer Relationship Management), search, and manage client relationships — especially for the sales pipeline. See `PRD.md` for full product requirements.

## Team Constitution (Mandatory)
Before doing any work, read and follow:
`WorkLogs/TEAM_CONSTITUTION.md`

Process requirements:
- If a task conflicts with the constitution, stop and ask the user.
- At the start of each task, summarize the applicable constitution rules before editing.
- Treat this constitution as required operating policy for this workspace.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) on React 19 |
| Language | TypeScript |
| Linting/Formatting | Biome via Ultracite |
| UI Components | shadcn/ui with Base UI primitives |
| Styling | Tailwind CSS 4 |
| E2E Testing | Playwright |
| Database | Neon PostgreSQL (serverless) with Drizzle ORM |
| Auth | Better Auth with Drizzle adapter |
| AI / Vision | Anthropic Claude API and Z.AI (vision providers; AI chat itself is V2) |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` + `wrangler` |
| Photo Storage | Cloudflare R2 (`PHOTO_BUCKET` binding) |

## Quick Reference

- **Format code**: `npm exec -- ultracite fix`
- **Check for issues**: `npm exec -- ultracite check`
- **Diagnose setup**: `npm exec -- ultracite doctor`
- **Run dev server**: `npm run dev`
- **Run E2E tests**: `npx playwright test`
- **Local preview of the Cloudflare bundle**: `npm run preview`
- **Deploy to Cloudflare**: `npm run deploy`
- **Push schema to prod Neon**: `npm run db:push:prod` (reads `.env.production`)

**Always run `npm exec -- ultracite fix` before committing.**

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity. This app is used on phones and tablets on a workshop floor — prioritise speed, large touch targets, and legibility.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers — extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions — don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully — don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)

---

## Testing

- Use Playwright for end-to-end and browser workflow testing
- Prioritise Playwright coverage for the core mobile flows: search, browse by location, QR entry points, reorder, and quick add
- Prefer Playwright assertions that verify visible user behaviour rather than implementation details
- Use Playwright projects or viewports that reflect phone and tablet usage on the workshop floor
- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests — use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat — avoid excessive `describe` nesting

## When Biome Can't Help

Focus your attention on:

1. **Business logic correctness** — Biome can't validate your algorithms
2. **Meaningful naming** — use descriptive names for functions, variables, and types
3. **Architecture decisions** — component structure, data flow, and API design
4. **Edge cases** — handle boundary conditions and error states
5. **Mobile UX** — large touch targets, fast interactions, works with dirty hands
6. **Accessibility** — screen readers, keyboard nav, colour contrast
