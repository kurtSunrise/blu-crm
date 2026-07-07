"use client";

import { BookOpenIcon } from "lucide-react";
import type { SourceRef } from "@/lib/ai/stream-protocol";
import { formatDateAwst } from "@/lib/format";

export interface SourceChipsData {
  sources: SourceRef[];
}

// "Updated DD/MM/YYYY" for the chip's tooltip, so stale guidance is
// spottable. Older persisted artifacts predate updatedAt; treat a missing or
// unparseable value as unknown and show nothing.
const updatedLabelOf = (source: SourceRef): string | null => {
  if (!source.updatedAt) {
    return null;
  }
  const updated = new Date(source.updatedAt);
  if (Number.isNaN(updated.getTime())) {
    return null;
  }
  return `Updated ${formatDateAwst(updated)}`;
};

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
        {data.sources.map((source) => {
          const updatedLabel = updatedLabelOf(source);
          return (
            <li
              className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-muted-foreground text-xs"
              key={`${source.docTitle}-${source.heading ?? ""}`}
              title={updatedLabel ?? undefined}
            >
              <BookOpenIcon aria-hidden className="size-3 shrink-0 text-blu" />
              <span className="max-w-56 truncate">
                {source.docTitle}
                {source.heading ? ` § ${source.heading}` : ""}
              </span>
              {updatedLabel ? (
                <span className="sr-only">, {updatedLabel.toLowerCase()}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
