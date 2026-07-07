// Wire protocol between /api/chat and the chat runtime adapter: one JSON
// payload per line (NDJSON). Isomorphic: type-only imports are fine (they are
// erased at compile time), but no runtime server imports.

import type { AlertDeal } from "@/lib/alerts";
import type {
  PipelineTotals,
  ReportActionRow,
  ReportDealRow,
  StageBreakdownRow,
} from "@/lib/reports";

export type ArtifactType =
  | "deal_card"
  | "deal_list"
  | "draft_message"
  | "weekly_report";

// One knowledge-base passage attribution shown as a source chip.
// updatedAt is the source document's last update as an ISO string (null when
// unknown) so the chip can flag stale guidance.
export interface SourceRef {
  docTitle: string;
  heading: string | null;
  updatedAt: string | null;
}

// The weekly_report artifact payload. Derived from WeeklyReport in
// src/lib/reports.ts with every Date field remapped to an ISO string, so the
// compiler flags any drift when the report shape changes.
export type WeeklyReportDealRow = ReportDealRow;

export type WeeklyReportActionRow = Omit<ReportActionRow, "dueDate"> & {
  // ISO string
  dueDate: string;
};

export type WeeklyReportAlertDeal = Omit<
  AlertDeal,
  "createdAt" | "expectedCloseDate" | "fixedDate" | "lastContactAt"
> & {
  createdAt: string;
  expectedCloseDate: string | null;
  fixedDate: string | null;
  lastContactAt: string | null;
};

export type WeeklyReportStageBreakdown = StageBreakdownRow;

export type WeeklyReportTotals = PipelineTotals;

export interface WeeklyReportArtifactData {
  actions: WeeklyReportActionRow[];
  closingSoon: WeeklyReportAlertDeal[];
  closingSoonDays: number;
  // ISO string
  generatedAt: string;
  lostThisWeek: WeeklyReportDealRow[];
  needsAttention: WeeklyReportAlertDeal[];
  newThisWeek: number;
  openByStage: {
    deals: WeeklyReportDealRow[];
    stage: WeeklyReportStageBreakdown;
  }[];
  staleDays: number;
  totals: WeeklyReportTotals;
  // ISO string
  weekStart: string;
  wonThisWeek: WeeklyReportDealRow[];
}

// One gated write awaiting user review inside a confirmation request
export interface ConfirmationItem {
  input: unknown;
  summary: string;
  toolName: string;
  toolUseId: string;
}

export interface ArtifactPayload {
  artifactType: ArtifactType;
  data: unknown;
  type: "artifact";
}

export type StreamPayload =
  | ArtifactPayload
  | { type: "thread"; threadId: string }
  // Liveness/progress signal: "thinking" while the model reasons silently,
  // "responding" once visible text starts. Resets the client's stall watchdog
  // and drives the transient "Thinking…" indicator; carries no transcript.
  | { type: "status"; state: "thinking" | "responding" }
  | { type: "text"; delta: string }
  // Extended-thinking summary deltas, rendered as a collapsible section
  | { type: "reasoning"; delta: string }
  // label is the human-readable activity line ("Searching deals")
  | { type: "tool_start"; toolUseId: string; toolName: string; label: string }
  | {
      type: "tool_done";
      toolUseId: string;
      toolName: string;
      isError?: boolean;
    }
  // A multi-step write plan awaiting review. The legacy top-level fields
  // mirror items[0] so a stale client bundle mid-deploy still renders a
  // single-item card; remove them once this release is verified live.
  | {
      type: "confirmation_request";
      items: ConfirmationItem[];
      toolUseId: string;
      toolName: string;
      input: unknown;
      summary: string;
    }
  // Knowledge-base attributions for the current answer
  | { type: "sources"; sources: SourceRef[] }
  // Deterministic follow-up prompts offered as chips after the turn
  | { type: "suggestions"; prompts: string[] }
  | { type: "data_changed"; paths: string[] }
  | { type: "error"; message: string; retryable: boolean }
  | { type: "done"; messageId: string | null };

export const encodeStreamPayload = (payload: StreamPayload): string =>
  `${JSON.stringify(payload)}\n`;

const isStreamPayload = (value: unknown): value is StreamPayload =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof (value as { type: unknown }).type === "string";

export const parseStreamLine = (line: string): StreamPayload | null => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isStreamPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// Reads an NDJSON body and invokes onPayload per decoded line, buffering
// partial lines across chunks (the Billify reader pattern).
export const readStreamPayloads = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onPayload: (payload: StreamPayload) => void
): Promise<void> => {
  const decoder = new TextDecoder();
  let pending = "";

  const handle = (line: string) => {
    const payload = parseStreamLine(line);
    if (payload) {
      onPayload(payload);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      pending += decoder.decode();
      break;
    }
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      handle(line);
    }
  }

  if (pending.trim().length > 0) {
    handle(pending);
  }
};
