"use client";

import { useMessage, useMessageRuntime } from "@assistant-ui/react";
import { RefreshCwIcon } from "lucide-react";
import {
  CitationList,
  type CitationListData,
} from "@/components/ai/artifacts/citation-list";
import {
  DealCardArtifact,
  type DealCardData,
} from "@/components/ai/artifacts/deal-card-artifact";
import {
  DealListArtifact,
  type DealListData,
} from "@/components/ai/artifacts/deal-list-artifact";
import {
  DraftMessageArtifact,
  type DraftMessageData,
} from "@/components/ai/artifacts/draft-message-artifact";
import {
  SourceChips,
  type SourceChipsData,
} from "@/components/ai/artifacts/source-chips";
import {
  WeeklyReportArtifact,
  type WeeklyReportArtifactData,
} from "@/components/ai/artifacts/weekly-report-artifact";
import {
  ConfirmationCard,
  type ConfirmationRequestData,
} from "@/components/ai/confirmation-card";
import {
  MemorySavedChip,
  type MemorySavedData,
} from "@/components/ai/memory-saved-chip";
import { Button } from "@/components/ui/button";

interface DataPart {
  data: unknown;
  name: string;
  type: "data";
}

const isDataPart = (part: { type: string }): part is DataPart =>
  part.type === "data";

// "Try again" affordance pushed after a retryable error or a client-side
// stall. The failed turn left no assistant content worth keeping, so a
// regenerate reload of this message is the right recovery.
function RetryHintButton() {
  const messageRuntime = useMessageRuntime();
  return (
    <Button
      className="my-2 min-h-11"
      onClick={() =>
        messageRuntime.reload({ runConfig: { custom: { regenerate: true } } })
      }
      type="button"
      variant="outline"
    >
      <RefreshCwIcon aria-hidden className="size-4" />
      Try again
    </Button>
  );
}

// Artifact cards arrive as unstable data content parts on the assistant
// message (Billify pattern); MessagePrimitive.Parts skips them, so this
// renders them after the prose.
// True when a sibling data part carries at least one numbered citation.
const hasCitationsPart = (parts: DataPart[]): boolean =>
  parts.some(
    (part) =>
      part.name === "citations" &&
      ((part.data as { citations?: unknown[] } | null)?.citations?.length ??
        0) > 0
  );

export function DataPartsRenderer() {
  const message = useMessage();
  if (!Array.isArray(message.content)) {
    return null;
  }

  const dataParts = message.content.filter(isDataPart);
  // Suppression rule: when this message carries a numbered citations part,
  // the flat "sources" chips are skipped so the answer is not attributed
  // twice. The chips remain the fallback for turns without citations. The
  // check reads siblings off the message content, so it holds for both live
  // streams and resumed threads.
  const suppressSources = hasCitationsPart(dataParts);

  return (
    <>
      {dataParts.map((part, index) => {
        const key = `${part.name}-${index}`;
        switch (part.name) {
          case "deal_card":
            return (
              <DealCardArtifact data={part.data as DealCardData} key={key} />
            );
          case "deal_list":
            return (
              <DealListArtifact data={part.data as DealListData} key={key} />
            );
          case "draft_message":
            return (
              <DraftMessageArtifact
                data={part.data as DraftMessageData}
                key={key}
              />
            );
          case "confirmation_request":
            return (
              <ConfirmationCard
                data={part.data as ConfirmationRequestData}
                key={key}
              />
            );
          case "weekly_report":
            return (
              <WeeklyReportArtifact
                data={part.data as WeeklyReportArtifactData}
                key={key}
              />
            );
          case "citations":
            return (
              <CitationList data={part.data as CitationListData} key={key} />
            );
          case "memory_saved":
            return (
              <MemorySavedChip data={part.data as MemorySavedData} key={key} />
            );
          case "sources":
            return suppressSources ? null : (
              <SourceChips data={part.data as SourceChipsData} key={key} />
            );
          case "retry_hint":
            return <RetryHintButton key={key} />;
          default:
            return null;
        }
      })}
    </>
  );
}
