import type * as Anthropic from "@/lib/ai/anthropic";

// Numbered inline citations for knowledge answers (Assistant v3 Phase 3).
// This module is the single source of the numbering rule so the live stream
// (agent-loop numbering citations as citations_delta events arrive) and the
// resume path (threads.ts re-deriving them from persisted assistant content)
// assign identical markers.
//
// Numbering rule, exactly:
// - Scope is one assistant message. Each message starts a fresh numberer.
// - Citations are visited in encounter order: content blocks in array order,
//   and within a text block its `citations` array in order. Live, encounter
//   order is the citations_delta arrival order, which is the same sequence.
// - Only well-formed search_result_location citations count; anything else
//   returns null from assign() and is ignored.
// - The dedupe key is the citation's `title` (trimmed) when non-empty, else
//   its `source` (trimmed). The first appearance of a key is allocated the
//   next integer marker starting at 1; later appearances reuse that marker.
// - The card snippet is the FIRST appearance's cited_text, whitespace-trimmed
//   and cut to 200 characters (with a trailing ellipsis when cut). Later
//   citations for the same key never update the snippet.

export interface CitationRef {
  marker: number;
  snippet: string;
  title: string;
}

export interface AssignedCitation extends CitationRef {
  // True on the first appearance of this title within the message: the
  // moment to emit the numbered source card (wire payload or display list).
  isNew: boolean;
}

const SNIPPET_MAX_CHARS = 200;

const trimSnippet = (citedText: string): string => {
  const trimmed = citedText.trim();
  return trimmed.length > SNIPPET_MAX_CHARS
    ? `${trimmed.slice(0, SNIPPET_MAX_CHARS).trimEnd()}…`
    : trimmed;
};

// Structural guard: persisted content round-trips through jsonb, so this
// never trusts the vendored type and checks the fields it actually reads.
export const isSearchResultLocation = (
  citation: unknown
): citation is Anthropic.SearchResultLocationCitation => {
  if (typeof citation !== "object" || citation === null) {
    return false;
  }
  const value = citation as Record<string, unknown>;
  return (
    value.type === "search_result_location" &&
    typeof value.cited_text === "string" &&
    typeof value.source === "string" &&
    (typeof value.title === "string" || value.title === null)
  );
};

const titleKeyFor = (
  citation: Anthropic.SearchResultLocationCitation
): string | null => {
  const title = citation.title?.trim();
  if (title) {
    return title;
  }
  const source = citation.source.trim();
  return source.length > 0 ? source : null;
};

// Stateful per-message numberer: the live path calls assign() from
// onCitation as deltas arrive; the batch path below drives it from persisted
// blocks. Identical inputs produce identical markers on both paths.
export const createCitationNumberer = (): {
  assign: (citation: unknown) => AssignedCitation | null;
  list: () => CitationRef[];
} => {
  const byTitle = new Map<string, CitationRef>();
  const assign = (citation: unknown): AssignedCitation | null => {
    if (!isSearchResultLocation(citation)) {
      return null;
    }
    const key = titleKeyFor(citation);
    if (!key) {
      return null;
    }
    const existing = byTitle.get(key);
    if (existing) {
      return { ...existing, isNew: false };
    }
    const ref: CitationRef = {
      marker: byTitle.size + 1,
      snippet: trimSnippet(citation.cited_text),
      title: key,
    };
    byTitle.set(key, ref);
    return { ...ref, isNew: true };
  };
  const list = (): CitationRef[] => [...byTitle.values()];
  return { assign, list };
};

export interface CitationMarkerAssignment {
  // The numbered source list for the whole message, marker ascending.
  citations: CitationRef[];
  // Per input block (same indices as `blocks`): the distinct markers cited
  // by that block, ascending, empty for uncited or non-text blocks. Display
  // code appends " [N]" per marker right after the block's text.
  markersForBlock: number[][];
}

// Batch form over a persisted assistant message's content blocks (resume
// path). Accepts unknown because chat_message.content is jsonb.
export const assignCitationMarkers = (
  blocks: unknown[]
): CitationMarkerAssignment => {
  const numberer = createCitationNumberer();
  const markersForBlock = blocks.map((block) => {
    if (typeof block !== "object" || block === null) {
      return [];
    }
    const value = block as { citations?: unknown; type?: unknown };
    if (value.type !== "text" || !Array.isArray(value.citations)) {
      return [];
    }
    const markers: number[] = [];
    for (const citation of value.citations) {
      const assigned = numberer.assign(citation);
      if (assigned && !markers.includes(assigned.marker)) {
        markers.push(assigned.marker);
      }
    }
    return markers.sort((a, b) => a - b);
  });
  return { citations: numberer.list(), markersForBlock };
};
