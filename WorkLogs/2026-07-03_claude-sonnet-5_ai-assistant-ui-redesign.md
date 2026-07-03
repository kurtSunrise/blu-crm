# Work Log: AI Assistant Chat UI Redesign

**Agent**: Claude Sonnet 5
**Session ID**: N/A
**Mode**: Plan then implement (interactive)
**Date**: 2026-07-03T03:40:00+08:00

## Task Description

Redesign the AI Assistant chat UI (`src/components/ai/**`) to a "best in class" standard: motion, richer markdown/code rendering, differentiated artifact/confirmation cards, attachment UX, and a proper thinking/streaming indicator. Presentation-layer only; no changes to the NDJSON stream protocol, server-side tools, or database schema.

## Actions Taken

- Explored the current implementation and Billify (a sibling app, used as an interaction/structure reference only, not a styling reference).
- Wrote and got approval on a phased implementation plan (`/Users/user/.claude/plans/vast-wiggling-sprout.md`).
- Phase 1 (styling-only): message entrance animation; confirmation card recoloured from `--blu` to `--warning`/`--success`; artifact cards (`deal-card-artifact.tsx`, `deal-list-artifact.tsx`, `draft-message-artifact.tsx`) upgraded to an elevated shell with icon-led headers; suggestion pills switched from a vertical stack to a horizontal scroll row; markdown heading/blockquote/table/hr polish; floating scroll-to-bottom button; settings gear link added to the dock header (`/settings/ai`).
- Phase 2: attachment thumbnails moved to `Avatar`, click-to-preview `Dialog` for images, drag-and-drop onto the composer, an honest "Uploading…" indicator (hand-rolled via `useComposerRuntime` since the runtime only inserts an attachment once `add()` resolves — there is no per-file progress signal to read), hover-reveal copy button on assistant messages (`ActionBarPrimitive.Copy`), and a real code-block renderer (`code-block.tsx`) with language label + copy.
- Phase 3: removed the static `"Thinking…"` placeholder string from `ai-runtime-provider.tsx`; the UI now derives "thinking" (`status.type === "running"` + empty content) and "streaming" (`MessagePartPrimitive.InProgress`) from assistant-ui's own message state. Replaced the panel's instant `hidden`/`flex` toggle with a `translate`+`transition-transform` slide (bottom-sheet on mobile, right-slide on desktop) plus `inert` when closed.
- Phase 4: added `collapsible` (Base UI-backed, via `npx shadcn@latest add collapsible`) and wired a "show more" affordance into the deal card's recent-activity list. Skipped `scroll-area` as optional/lower-priority per the plan.
- Verification: `npm exec -- ultracite check src` and `npm run build` both pass clean. Could not complete a manual browser walkthrough — the Chrome extension was not connected in this session, and testing the panel requires an authenticated session.
- Follow-up review pass (same session): confirmed Base UI native buttons default to `type="button"` (so the image-preview DialogTrigger inside the composer form cannot submit a message), then fixed four findings — an unhandled promise rejection per failed upload in `useAttachmentUpload` (error was already surfaced via `attachmentError`; added a catch), invalid `div`-inside-`span` nesting in the attachment chip (chip is now a `div`), suggestion pills hiding most of their ~40-char text under `whitespace-nowrap` in the 400px panel (now wrap inside a `max-w-[80%]` pill), and the drag-highlight triggering for non-file drags (now gated on `dataTransfer.types` including `Files`). Also tightened the hover copy bar so it no longer reserves a tall invisible row under every assistant message.

## Decisions Made

- Kept the bubble-less, minimal assistant-message style (no card container) rather than switching to a Billify-style contained bubble — presented as the recommended default since the user did not confirm when asked.
- Kept the desktop panel at its existing fixed 400px width.
- Reserved colour for state/severity (confirmation = warning, resolved = success), not for artifact category, to avoid diluting Blu's small semantic colour vocabulary or colliding with `--blu`'s existing "primary/user" meaning.
- Confirmed at the source level (`node_modules`) that Base UI already ships `collapsible` and `scroll-area` equivalents to the Radix primitives Billify uses — the plan's flagged "technical risk" turned out to be a non-issue.
- Used `Button`'s Base UI `render` prop (not `asChild`, which this project's `Button` does not support) for the new settings link — caught by `tsc`, not by Biome.
- Skipped `ActionBarPrimitive.Reload` (retry) — ambiguous semantics after a confirmation round-trip risked a double-write against the FR-7.8 gated-write invariant.

## Issues Encountered

- A `Plan` subagent call hit the session limit mid-run and returned no output; re-ran it after the session reset and it completed normally.
- `ActionBarPrimitive.Copy asChild` wrapping the new `TooltipIconButton` compound component risked losing ref-forwarding through the Tooltip/Button nesting; simplified to a plain `Button`, matching the existing `ComposerPrimitive.Send`/`Cancel` pattern already proven in this file.
- No manual UI verification was possible this session (browser extension not connected, panel requires auth). Flagged explicitly to the user rather than claiming full verification.

## Addendum: Context Chip (Copilot-style, same session)

The user asked to adopt Microsoft Copilot's "referenced topic" chip. Investigation showed the plumbing already existed but was half-wired: `registerEntity`/`clearEntity` in `ai-context.tsx` were never called by any page (dead code), while the server independently derives the deal/contact from the pathname in `buildPageContext` — so the assistant was already using page context invisibly. Fix:

- New `src/components/ai/ai-entity-beacon.tsx` — client component rendered by the deal and contact detail pages; registers `{dealId|contactId, label}` on mount, clears on unmount.
- `chat-panel.tsx` — new `ContextChip` above the composer showing the entity label (Handshake icon for deals, User icon for contacts) with an sr-only "The assistant is using" prefix.
- Deal page label is `LEAD-ID · Title`; contact page label is the person's name.
- Side benefit: explicit ids now flow to `/api/chat` instead of relying purely on pathname inference.
- No dismiss control in v1: the server would still infer context from the pathname, so a dismissable chip would lie. If dismissal is wanted later it needs a "suppress page context" flag through to the server.

## Addendum 2: History context chips + search (same session)

Follow-on request: show the context chip in the history list too, plus search to find older chats. `chat_thread` already stores `dealId`/`contactId` per thread, so:

- `src/lib/ai/threads.ts` — `listThreadsForUser` now left-joins `deal` and `contact`, returns a `context` label per thread (`LEAD-ID · Title` for deals, name for contacts — same shape as the composer chip), and takes an optional search query (`ilike` over thread title, deal title, lead id, contact name, with LIKE-wildcard escaping) applied over the user's whole history before the 30-row limit, so search genuinely reaches older chats.
- `src/app/api/chat/threads/route.ts` — passes `?q=` through.
- `src/components/ai/thread-history.tsx` — search input (debounced 250ms, sr-only label, `type="search"`), context chip per row (mirrors the composer chip), and a distinct "No conversations match that search" empty state.

## Next Steps

- User (or a future session with browser access) should run the manual checklist from the plan: open/close the panel, send a message and watch it stream, trigger a confirmation card (both Confirm and Cancel), attach a file both via the button and via drag-and-drop, resume a thread from history, and check all of the above at a mobile viewport width.
- `scroll-area` was skipped as optional; revisit only if `thread-history.tsx`'s native scrollbar becomes a real complaint.

## Related Files

- `src/components/ai/ai-runtime-provider.tsx`
- `src/components/ai/chat-panel.tsx`
- `src/components/ai/chat-launcher.tsx`
- `src/components/ai/markdown-text.tsx`
- `src/components/ai/confirmation-card.tsx`
- `src/components/ai/code-block.tsx` (new)
- `src/components/ai/tooltip-icon-button.tsx` (new)
- `src/components/ai/artifacts/deal-card-artifact.tsx`
- `src/components/ai/artifacts/deal-list-artifact.tsx`
- `src/components/ai/artifacts/draft-message-artifact.tsx`
- `src/components/ui/collapsible.tsx` (new)
