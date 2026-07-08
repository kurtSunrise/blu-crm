# Work Log: AI assistant width toggle and tidier starter chips

**Agent**: Claude Opus 4.8 (1M context) (claude-opus-4-8[1m])
**Session ID**: 556690ee-e5be-4963-8ed8-f6813bd380b6
**Mode**: Interactive (plan mode, then implementation)
**Date**: 2026-07-08T00:00:00Z

## Task Description

The desktop left sidebar has a "Collapse sidebar" control, but the right-hand
AI assistant dock was locked at a fixed 400px. The user asked for a co-pilot
style control so the assistant can be made wider when needed (never narrower).
Follow-ups during the session: make the control more discoverable (it was easy
to miss), and tidy the assistant's starter-prompt chips, which ballooned into
tall multi-line blobs when an entity-aware prompt embedded a long deal name.

## Actions Taken

- Added a persisted "wide" preference mirroring the sidebar collapse pattern:
  new `ASSISTANT_WIDE_COOKIE` constant in `src/lib/sidebar-prefs.ts` and a
  `setAssistantWide` server action in `src/lib/sidebar-actions.ts` (cookie
  writes go through a server action, per the constitution / Biome rule).
- Threaded a `defaultWide` prop from the cookie read in
  `src/app/(app)/layout.tsx` through `AppShell` into `AiAssistantProvider`
  (`src/components/ai/ai-context.tsx`), which now exposes `wide` + `toggleWide`.
- Made the two coupled width sites conditional (literal, JIT-safe classes):
  the dock `<aside>` in `src/components/ai/chat-launcher.tsx`
  (`md:w-[400px]` / `md:w-[640px]`, width now animates via
  `transition-[transform,width]`) and the main content gutter in
  `src/components/app-shell.tsx` (`md:pr-[400px]` / `md:pr-[640px]`).
- Added a desktop-only toggle to the dock header. After the user reported not
  seeing it, changed it from thin chevrons to a distinct diagonal resize icon
  (`Maximize2` / `Minimize2`) and set it apart from the chat-action icons with
  a divider.
- Tidied the starter-prompt chips (`src/components/ai/welcome-suggestions.ts`
  and the `SuggestionChip`/`ThreadWelcome`/`FollowUpSuggestions` in
  `src/components/ai/chat-panel.tsx`): entity prompts now show a short
  `display` label ("Summarise this deal ...") while still sending the full
  record name; every chip is a single-line pill that truncates rather than
  wrapping, with a hover tooltip revealing the full prompt.
- Added two What's New entries and this work log.

## Decisions Made

- Two-state toggle (400px / 640px) rather than a drag-resize handle: matches
  the sidebar collapse pattern the user referenced and avoids inline-style /
  pointer-handling complexity. 640px approximates GitHub Copilot's wide chat.
- Width flag lives in `AiAssistantProvider` because both `AppShellInner` (the
  content gutter) and `AiAssistantDock` (the panel width + the toggle button)
  consume it via `useAiAssistant()`.
- Chips decouple `display` (short, in the chip) from `prompt` (full, sent), so
  the transcript stays unambiguous and the assistant keeps an explicit record
  reference without relying on the entity beacon still being mounted.
- Tooltip is applied to every chip, not only truncated ones: detecting real
  truncation needs DOM measurement, and an always-on reveal is simpler and is
  exactly what the user asked for after the shortened generic chips truncated.

## Issues Encountered

- First discoverability attempt (chevrons among six near-identical ghost icons)
  was missed by the user; resolved with the diagonal resize icon + divider.
- The initial chip change only added tooltips to entity chips, so shortened
  generic chips truncated with no reveal; fixed by making the tooltip
  unconditional.

## Next Steps

- Deploy to production via local `npm run deploy` (bundled with the separately
  committed mobile-nav scroll-affordance work) and verify on the live URL.

## Related Files

- `src/lib/sidebar-prefs.ts`, `src/lib/sidebar-actions.ts`
- `src/components/ai/ai-context.tsx`, `src/components/ai/chat-launcher.tsx`
- `src/components/app-shell.tsx`, `src/app/(app)/layout.tsx`
- `src/components/ai/welcome-suggestions.ts`, `src/components/ai/chat-panel.tsx`
- `src/app/(app)/help/page.tsx` (What's New)
