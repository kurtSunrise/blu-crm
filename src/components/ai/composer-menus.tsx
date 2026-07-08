"use client";

import { useComposer, useComposerRuntime } from "@assistant-ui/react";
import { HandshakeIcon, Loader2Icon, UserIcon } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { cn } from "@/lib/utils";

// Composer power menus (Assistant v3 Phase 4): a slash-command palette when
// "/" opens an empty composer, and an @-mention typeahead over deals and
// contacts (GET /api/chat/entity-search). Both render as a list directly
// above the composer, are keyboard navigable (up/down, enter, escape) and
// tappable (44px rows), and never auto-send: a slash pick fills the input, a
// mention pick inserts a readable token and records the entity id in
// ai-context's mentionsRef for the next send.

interface SlashCommand {
  command: string;
  description: string;
  prompt: (hasDealContext: boolean) => string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/report",
    description: "This week's pipeline report",
    prompt: () => "Give me this week's pipeline report",
  },
  {
    command: "/rank",
    description: "Rank my open deals",
    prompt: () => "Rank my open deals",
  },
  {
    command: "/draft",
    description: "Draft a follow-up email",
    prompt: () => "Draft a follow-up email for ",
  },
  {
    command: "/summarise",
    description: "Summarise a deal",
    prompt: (hasDealContext) =>
      hasDealContext ? "Summarise this deal" : "Summarise ",
  },
  {
    command: "/remember",
    description: "Save something to memory",
    prompt: () => "Remember that ",
  },
];

interface EntitySearchResponse {
  contacts: { companyName: string | null; id: string; name: string }[];
  deals: { id: string; leadId: string; title: string }[];
}

interface MentionOption {
  id: string;
  kind: "deal" | "contact";
  label: string;
  secondary: string | null;
  token: string;
}

const MENTION_QUERY_MIN = 2;
const MENTION_QUERY_MAX = 40;
const MENTION_DEBOUNCE_MS = 200;
const WHITESPACE = /\s/;

// Deals first, matching the grouped rendering order, so a flat highlight
// index maps straight onto the visible rows.
const toMentionOptions = (data: EntitySearchResponse): MentionOption[] => [
  ...data.deals.map((deal) => ({
    id: deal.id,
    kind: "deal" as const,
    label: `${deal.leadId} ${deal.title}`,
    secondary: "Deal",
    token: `@${deal.leadId} ${deal.title}`,
  })),
  ...data.contacts.map((contact) => ({
    id: contact.id,
    kind: "contact" as const,
    label: contact.name,
    secondary: contact.companyName,
    token: `@${contact.name}`,
  })),
];

interface MentionSpan {
  query: string;
  start: number;
}

// The "@word(s)" span the caret is inside: the nearest "@" before the caret
// that starts a word, with no newline or second "@" in between. Null means
// no mention is being typed.
const findMentionSpan = (text: string, caret: number): MentionSpan | null => {
  const upto = text.slice(0, caret);
  const start = upto.lastIndexOf("@");
  if (start < 0) {
    return null;
  }
  const before = start > 0 ? upto[start - 1] : " ";
  if (before && !WHITESPACE.test(before)) {
    return null;
  }
  const query = upto.slice(start + 1);
  if (query.includes("\n") || query.length > MENTION_QUERY_MAX) {
    return null;
  }
  return { query, start };
};

// Shared row styling for both menus: full-width 44px targets, highlight
// driven by the keyboard index or hover.
const optionClassName = (highlighted: boolean): string =>
  cn(
    "flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm",
    highlighted ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
  );

function MenuSurface({
  children,
  label,
  listboxId,
}: {
  children: ReactNode;
  label: string;
  listboxId: string;
}) {
  return (
    <div
      aria-label={label}
      className="max-h-60 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
      id={listboxId}
      role="listbox"
    >
      {children}
    </div>
  );
}

interface MentionSearchState {
  loading: boolean;
  options: MentionOption[];
}

// Debounced lookup against /api/chat/entity-search for the active mention
// query. Results reset whenever the query drops below the minimum length.
const useMentionSearch = (query: string | null): MentionSearchState => {
  const [state, setState] = useState<MentionSearchState>({
    loading: false,
    options: [],
  });

  useEffect(() => {
    const trimmed = query?.trim() ?? "";
    if (trimmed.length < MENTION_QUERY_MIN) {
      setState({ loading: false, options: [] });
      return;
    }
    setState((current) => ({ ...current, loading: true }));
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/chat/entity-search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          setState({ loading: false, options: [] });
          return;
        }
        const data = (await response.json()) as EntitySearchResponse;
        setState({ loading: false, options: toMentionOptions(data) });
      } catch {
        if (!controller.signal.aborted) {
          setState({ loading: false, options: [] });
        }
      }
    }, MENTION_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return state;
};

export interface ComposerMenusResult {
  // Extra props for ComposerPrimitive.Input: keyboard navigation while a
  // menu is open, plus caret tracking for the mention span.
  inputProps: {
    "aria-activedescendant": string | undefined;
    onClick: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onKeyUp: () => void;
  };
  // The open menu (or null), rendered directly above the composer.
  menu: ReactNode;
}

interface MenuModel {
  onSelect: (index: number) => void;
  optionCount: number;
}

// Keyboard behaviour shared by both menus, applied to the composer textarea.
// preventDefault on Enter stops assistant-ui's submit handler (it composes
// after ours and respects defaultPrevented).
const menuKeyDown = (
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  model: MenuModel,
  highlight: number,
  setHighlight: (next: number) => void,
  dismiss: () => void
): void => {
  if (event.key === "Escape") {
    event.preventDefault();
    dismiss();
    return;
  }
  if (model.optionCount === 0) {
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setHighlight((highlight + 1) % model.optionCount);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    setHighlight((highlight - 1 + model.optionCount) % model.optionCount);
    return;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    model.onSelect(highlight);
  }
};

export function useComposerMenus(
  inputRef: RefObject<HTMLTextAreaElement | null>
): ComposerMenusResult {
  const composerRuntime = useComposerRuntime();
  const { entity, mentionsRef } = useAiAssistant();
  const text = useComposer((state) => state.text);
  const listboxId = useId();

  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [mentionDismissedAt, setMentionDismissedAt] = useState<number | null>(
    null
  );

  // Track the caret after every text change; arrow moves and taps are caught
  // by the onKeyUp/onClick handlers below.
  useEffect(() => {
    setCaret(inputRef.current?.selectionStart ?? text.length);
    setHighlight(0);
  }, [text, inputRef]);

  const syncCaret = useCallback(() => {
    setCaret(inputRef.current?.selectionStart ?? 0);
  }, [inputRef]);

  // Slash palette: only when "/" opened an empty composer (the whole text is
  // still one "/word") and the user has not dismissed it.
  const slashQuery =
    text.startsWith("/") && !WHITESPACE.test(text)
      ? text.slice(1).toLowerCase()
      : null;
  const slashItems =
    slashQuery === null
      ? []
      : SLASH_COMMANDS.filter((item) =>
          item.command.slice(1).startsWith(slashQuery)
        );
  const slashOpen = !slashDismissed && slashItems.length > 0;
  useEffect(() => {
    if (slashQuery === null) {
      setSlashDismissed(false);
    }
  }, [slashQuery]);

  // Mention typeahead: active while the caret sits in an "@query" span the
  // user has not dismissed. The slash palette wins when both could match.
  const span = slashQuery === null ? findMentionSpan(text, caret) : null;
  const mentionActive = span !== null && span.start !== mentionDismissedAt;
  const { loading, options } = useMentionSearch(
    mentionActive ? span.query : null
  );
  const mentionOpen = mentionActive;
  useEffect(() => {
    if (span === null) {
      setMentionDismissedAt(null);
    }
  }, [span]);

  const placeCaret = useCallback(
    (position: number) => {
      requestAnimationFrame(() => {
        const element = inputRef.current;
        if (element) {
          element.focus();
          element.setSelectionRange(position, position);
        }
      });
    },
    [inputRef]
  );

  const selectSlash = useCallback(
    (index: number) => {
      const item = slashItems[index];
      if (!item) {
        return;
      }
      const prompt = item.prompt(Boolean(entity?.dealId));
      composerRuntime.setText(prompt);
      placeCaret(prompt.length);
    },
    [composerRuntime, entity, placeCaret, slashItems]
  );

  const selectMention = useCallback(
    (index: number) => {
      const option = options[index];
      if (!(option && span)) {
        return;
      }
      const inserted = `${option.token} `;
      const nextText = text.slice(0, span.start) + inserted + text.slice(caret);
      const mentions = mentionsRef.current;
      if (!mentions.some((mention) => mention.id === option.id)) {
        mentions.push({
          id: option.id,
          kind: option.kind,
          token: option.token,
        });
      }
      composerRuntime.setText(nextText);
      placeCaret(span.start + inserted.length);
    },
    [caret, composerRuntime, mentionsRef, options, placeCaret, span, text]
  );

  const model: MenuModel = slashOpen
    ? { onSelect: selectSlash, optionCount: slashItems.length }
    : { onSelect: selectMention, optionCount: options.length };

  const dismiss = useCallback(() => {
    if (slashOpen) {
      setSlashDismissed(true);
      return;
    }
    if (span) {
      setMentionDismissedAt(span.start);
    }
  }, [slashOpen, span]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashOpen || mentionOpen) {
        menuKeyDown(event, model, highlight, setHighlight, dismiss);
      }
    },
    [dismiss, highlight, mentionOpen, model, slashOpen]
  );

  let menu: ReactNode = null;
  if (slashOpen) {
    menu = (
      <MenuSurface label="Commands" listboxId={listboxId}>
        {slashItems.map((item, index) => (
          <button
            aria-selected={index === highlight}
            className={optionClassName(index === highlight)}
            id={`${listboxId}-option-${index}`}
            key={item.command}
            onClick={() => selectSlash(index)}
            onMouseDown={(event) => event.preventDefault()}
            role="option"
            type="button"
          >
            <span className="font-medium font-mono text-blu">
              {item.command}
            </span>
            <span className="truncate text-muted-foreground text-xs">
              {item.description}
            </span>
          </button>
        ))}
      </MenuSurface>
    );
  } else if (mentionOpen) {
    menu = (
      <MentionMenu
        highlight={highlight}
        listboxId={listboxId}
        loading={loading}
        onSelect={selectMention}
        options={options}
        query={span?.query ?? ""}
      />
    );
  }

  const activeDescendant =
    (slashOpen || mentionOpen) && model.optionCount > 0
      ? `${listboxId}-option-${highlight}`
      : undefined;

  return {
    inputProps: {
      "aria-activedescendant": activeDescendant,
      onClick: syncCaret,
      onKeyDown,
      onKeyUp: syncCaret,
    },
    menu,
  };
}

function MentionOptionRow({
  highlighted,
  listboxId,
  index,
  onSelect,
  option,
}: {
  highlighted: boolean;
  index: number;
  listboxId: string;
  onSelect: (index: number) => void;
  option: MentionOption;
}) {
  const Icon = option.kind === "deal" ? HandshakeIcon : UserIcon;
  return (
    <button
      aria-selected={highlighted}
      className={optionClassName(highlighted)}
      id={`${listboxId}-option-${index}`}
      onClick={() => onSelect(index)}
      onMouseDown={(event) => event.preventDefault()}
      role="option"
      type="button"
    >
      <Icon aria-hidden className="size-3.5 shrink-0 text-blu" />
      <span className="truncate">{option.label}</span>
      {option.secondary ? (
        <span className="ml-auto shrink-0 text-muted-foreground text-xs">
          {option.secondary}
        </span>
      ) : null}
    </button>
  );
}

function MentionMenu({
  highlight,
  listboxId,
  loading,
  onSelect,
  options,
  query,
}: {
  highlight: number;
  listboxId: string;
  loading: boolean;
  onSelect: (index: number) => void;
  options: MentionOption[];
  query: string;
}) {
  const dealOptions = options.filter((option) => option.kind === "deal");
  const contactOptions = options.filter((option) => option.kind !== "deal");

  let status: string | null = null;
  if (query.trim().length < MENTION_QUERY_MIN) {
    status = "Type to search deals and contacts";
  } else if (loading && options.length === 0) {
    status = "Searching…";
  } else if (options.length === 0) {
    status = "No matching deals or contacts";
  }

  return (
    <MenuSurface label="Mention a deal or contact" listboxId={listboxId}>
      {status ? (
        <p className="flex min-h-11 items-center gap-2 px-3 text-muted-foreground text-sm">
          {loading ? (
            <Loader2Icon aria-hidden className="size-3.5 animate-spin" />
          ) : null}
          {status}
        </p>
      ) : null}
      {dealOptions.length > 0 ? (
        <p className="px-3 pt-1.5 pb-0.5 text-muted-foreground text-xs uppercase tracking-wide">
          Deals
        </p>
      ) : null}
      {dealOptions.map((option, index) => (
        <MentionOptionRow
          highlighted={index === highlight}
          index={index}
          key={option.id}
          listboxId={listboxId}
          onSelect={onSelect}
          option={option}
        />
      ))}
      {contactOptions.length > 0 ? (
        <p className="px-3 pt-1.5 pb-0.5 text-muted-foreground text-xs uppercase tracking-wide">
          Contacts
        </p>
      ) : null}
      {contactOptions.map((option, index) => (
        <MentionOptionRow
          highlighted={dealOptions.length + index === highlight}
          index={dealOptions.length + index}
          key={option.id}
          listboxId={listboxId}
          onSelect={onSelect}
          option={option}
        />
      ))}
    </MenuSurface>
  );
}
