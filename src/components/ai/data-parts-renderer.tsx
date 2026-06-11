"use client";

import { useMessage } from "@assistant-ui/react";
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
  ConfirmationCard,
  type ConfirmationRequestData,
} from "@/components/ai/confirmation-card";

interface DataPart {
  data: unknown;
  name: string;
  type: "data";
}

const isDataPart = (part: { type: string }): part is DataPart =>
  part.type === "data";

// Artifact cards arrive as unstable data content parts on the assistant
// message (Billify pattern); MessagePrimitive.Parts skips them, so this
// renders them after the prose.
export function DataPartsRenderer() {
  const message = useMessage();
  if (!Array.isArray(message.content)) {
    return null;
  }

  return (
    <>
      {message.content.filter(isDataPart).map((part, index) => {
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
          default:
            return null;
        }
      })}
    </>
  );
}
