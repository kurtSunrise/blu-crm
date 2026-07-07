"use client";

import { ChevronDownIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// One numbered citation behind an inline " [N]" marker in the answer text.
// Mirrors the `citation` stream payload and the thread GET's persisted shape.
export interface CitationRef {
  marker: number;
  snippet: string;
  title: string;
}

export interface CitationListData {
  citations: CitationRef[];
}

// One citation list per assistant message: dedupe by marker (first payload
// for a number wins) and keep the rows in marker order so "1." reads first.
// Shared by the live stream fold (ai-runtime-provider) and thread resume
// (chat-launcher) so both paths produce the identical data part.
export const normalizeCitations = (
  citations: readonly CitationRef[]
): CitationRef[] => {
  const byMarker = new Map<number, CitationRef>();
  for (const citation of citations) {
    if (!byMarker.has(citation.marker)) {
      byMarker.set(citation.marker, citation);
    }
  }
  return [...byMarker.values()].sort((a, b) => a.marker - b.marker);
};

// Ordering rule shared by the live fold and thread resume: the numbered
// citation list always renders immediately before any flat "sources" data
// part (the no-citation fallback chips), else at the end of the parts.
export const insertBeforeSourcesPart = <T extends { type: string }>(
  parts: T[],
  part: T
): void => {
  const sourcesIndex = parts.findIndex(
    (candidate) =>
      candidate.type === "data" &&
      (candidate as { name?: string }).name === "sources"
  );
  if (sourcesIndex >= 0) {
    parts.splice(sourcesIndex, 0, part);
  } else {
    parts.push(part);
  }
};

// Compact numbered source list under the answer. Each row expands in place
// (no popover: inline expansion is the one-handed, glove-friendly option on
// phones) to show the quoted passage the inline marker points at. Base UI's
// Collapsible.Trigger stamps aria-expanded on the row button.
export function CitationList({ data }: { data: CitationListData }) {
  const citations = Array.isArray(data.citations)
    ? normalizeCitations(data.citations)
    : [];
  if (citations.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 rounded-lg border bg-muted/30 px-2 py-1">
      <p className="px-1 pt-1 text-muted-foreground text-xs">Sources</p>
      <ol className="flex flex-col">
        {citations.map((citation) => (
          <li key={citation.marker}>
            <Collapsible>
              <CollapsibleTrigger className="group flex min-h-11 w-full items-center gap-2 rounded-md px-1 text-left text-muted-foreground text-xs transition-colors hover:text-foreground">
                <span className="shrink-0 font-medium tabular-nums">
                  {citation.marker}.
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {citation.title}
                </span>
                <ChevronDownIcon
                  aria-hidden
                  className="size-4 shrink-0 transition-transform group-aria-expanded:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-1 pb-2.5">
                <blockquote className="border-blu/30 border-l-2 pl-2.5 text-muted-foreground text-xs leading-relaxed">
                  {"“"}
                  {citation.snippet}
                  {"”"}
                </blockquote>
              </CollapsibleContent>
            </Collapsible>
          </li>
        ))}
      </ol>
    </div>
  );
}
