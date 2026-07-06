"use client";

import { BookOpenIcon } from "lucide-react";
import type { SourceRef } from "@/lib/ai/stream-protocol";

export interface SourceChipsData {
  sources: SourceRef[];
}

// Knowledge-base attributions for the answer above. The docs have no UI
// route, so these are non-navigating pills: an honest "where this came from"
// rather than links.
export function SourceChips({ data }: { data: SourceChipsData }) {
  if (data.sources.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">From:</span>
      <ul className="flex flex-wrap gap-1.5">
        {data.sources.map((source) => (
          <li
            className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-muted-foreground text-xs"
            key={`${source.docTitle}-${source.heading ?? ""}`}
          >
            <BookOpenIcon aria-hidden className="size-3 shrink-0 text-blu" />
            <span className="max-w-56 truncate">
              {source.docTitle}
              {source.heading ? ` § ${source.heading}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
