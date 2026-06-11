"use client";

import { useThreadRuntime } from "@assistant-ui/react";
import { CheckIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { Button } from "@/components/ui/button";

export interface ConfirmationRequestData {
  input: unknown;
  summary: string;
  toolName: string;
  toolUseId: string;
}

const FIELD_KEY_PATTERN = /([a-z])([A-Z])/g;

const humanizeKey = (key: string): string =>
  key.replaceAll(FIELD_KEY_PATTERN, "$1 $2").toLowerCase();

const formatValue = (value: unknown): string => {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
};

// Review card for a gated write (FR-7.8): shows exactly what the assistant
// wants to change; nothing is applied until Confirm. The decision rides
// through the runtime adapter as a confirmation POST, and the user bubble
// ("Approve" / "Cancel") keeps the thread history honest.
export function ConfirmationCard({ data }: { data: ConfirmationRequestData }) {
  const { pendingConfirmation, setDecision } = useAiAssistant();
  const threadRuntime = useThreadRuntime();
  const [resolved, setResolved] = useState<"approved" | "cancelled" | null>(
    null
  );

  // Only the live pending request is actionable; cards from history or a
  // superseded request render inert.
  const actionable =
    resolved === null && pendingConfirmation?.toolUseId === data.toolUseId;

  const decide = (approved: boolean) => {
    setDecision({ approved, toolUseId: data.toolUseId });
    setResolved(approved ? "approved" : "cancelled");
    threadRuntime.append(approved ? "Approve" : "Cancel");
  };

  const fields = Object.entries(
    typeof data.input === "object" && data.input !== null ? data.input : {}
  ).filter(([, value]) => formatValue(value).length > 0);

  return (
    <section
      aria-label={`Confirm: ${data.summary}`}
      className="my-2 rounded-lg border border-blu/40 bg-blu/5 p-3"
    >
      <div className="flex items-center gap-2">
        <ShieldAlertIcon aria-hidden className="size-4 shrink-0 text-blu" />
        <h3 className="font-medium text-sm">{data.summary}</h3>
      </div>

      {fields.length > 0 ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {fields.map(([key, value]) => (
            <div className="flex flex-col" key={key}>
              <dt className="text-muted-foreground text-xs capitalize">
                {humanizeKey(key)}
              </dt>
              <dd className="break-words text-sm">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {actionable ? (
          <>
            <Button
              className="min-h-11 flex-1"
              onClick={() => decide(true)}
              type="button"
            >
              <CheckIcon aria-hidden className="size-4" />
              Confirm
            </Button>
            <Button
              className="min-h-11 flex-1"
              onClick={() => decide(false)}
              type="button"
              variant="outline"
            >
              <XIcon aria-hidden className="size-4" />
              Cancel
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-xs" role="status">
            {resolved === "approved" && "Approved"}
            {resolved === "cancelled" && "Cancelled, nothing was changed"}
            {resolved === null && "Resolved"}
          </p>
        )}
      </div>
    </section>
  );
}
