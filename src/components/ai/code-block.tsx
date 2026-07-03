"use client";

import type { CodeHeaderProps } from "@assistant-ui/react-markdown";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const COPIED_RESET_MS = 2000;

// Rendered above a fenced code block by MarkdownText's `CodeHeader` slot
// (assistant-ui composes it automatically above `pre`/`code` for any block
// with a detected language). Monochrome, not a syntax highlighter — the
// assistant rarely emits code (quote formulas, mail-merge snippets), so a
// well-typeset block with copy is right-sized rather than adding a
// highlighter dependency.
export function CodeHeader({ language, code }: CodeHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <div className="flex items-center justify-between rounded-t-lg bg-foreground/90 px-3 py-1.5 text-background text-xs">
      <span className="lowercase">{language || "text"}</span>
      <Button
        aria-label="Copy code"
        className="h-6 px-2 text-background hover:bg-background/10 hover:text-background"
        onClick={copyCode}
        size="sm"
        type="button"
        variant="ghost"
      >
        {copied ? (
          <CheckIcon aria-hidden className="size-3.5" />
        ) : (
          <CopyIcon aria-hidden className="size-3.5" />
        )}
      </Button>
    </div>
  );
}
