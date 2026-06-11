"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface DraftMessageData {
  body: string;
  kind:
    | "followup_email"
    | "followup_sms"
    | "call_script"
    | "qualification_questions"
    | "quote_cover_note";
  signoffName?: string;
  subject?: string;
  title?: string;
}

const KIND_LABELS: Record<DraftMessageData["kind"], string> = {
  call_script: "Call script",
  followup_email: "Follow-up email",
  followup_sms: "Follow-up SMS",
  qualification_questions: "Qualification questions",
  quote_cover_note: "Quote cover note",
};

const COPIED_RESET_MS = 2000;

export function DraftMessageArtifact({ data }: { data: DraftMessageData }) {
  const [copied, setCopied] = useState(false);

  const copyDraft = async () => {
    const text = data.subject
      ? `Subject: ${data.subject}\n\n${data.body}`
      : data.body;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <section
      aria-label={data.title ?? KIND_LABELS[data.kind]}
      className="my-2 rounded-lg border bg-muted/30 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm">
            {data.title ?? KIND_LABELS[data.kind]}
          </h3>
          <p className="text-muted-foreground text-xs">
            {KIND_LABELS[data.kind]} · draft only, nothing has been sent
          </p>
        </div>
        <Button
          aria-label="Copy draft"
          onClick={copyDraft}
          size="sm"
          type="button"
          variant="outline"
        >
          {copied ? (
            <CheckIcon aria-hidden className="size-4" />
          ) : (
            <CopyIcon aria-hidden className="size-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {data.subject ? (
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">Subject:</span>{" "}
          <span className="font-medium">{data.subject}</span>
        </p>
      ) : null}

      <p className="mt-2 whitespace-pre-wrap rounded-md bg-background p-3 text-sm leading-relaxed">
        {data.body}
      </p>
    </section>
  );
}
