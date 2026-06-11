"use client";

import { CheckIcon, CopyIcon, PencilIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

// Drafts sync both ways: the body can be reworked in place before copying,
// so a quick tweak never needs another model round-trip (FR-7.4).
export function DraftMessageArtifact({ data }: { data: DraftMessageData }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(data.body);
  const bodyFieldId = useId();

  const edited = body !== data.body;

  const copyDraft = async () => {
    const text = data.subject ? `Subject: ${data.subject}\n\n${body}` : body;
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
            {KIND_LABELS[data.kind]} · {edited ? "edited draft" : "draft only"},
            nothing has been sent
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            aria-label={editing ? "Finish editing draft" : "Edit draft"}
            onClick={() => setEditing((current) => !current)}
            size="sm"
            type="button"
            variant="outline"
          >
            {editing ? (
              <CheckIcon aria-hidden className="size-4" />
            ) : (
              <PencilIcon aria-hidden className="size-4" />
            )}
            {editing ? "Done" : "Edit"}
          </Button>
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
      </div>

      {data.subject ? (
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">Subject:</span>{" "}
          <span className="font-medium">{data.subject}</span>
        </p>
      ) : null}

      {editing ? (
        <div className="mt-2 flex flex-col gap-1">
          <Label className="sr-only" htmlFor={bodyFieldId}>
            Draft body
          </Label>
          <Textarea
            className="bg-background leading-relaxed"
            id={bodyFieldId}
            onChange={(event) => setBody(event.target.value)}
            rows={Math.min(12, body.split("\n").length + 2)}
            value={body}
          />
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-background p-3 text-sm leading-relaxed">
          {body}
        </p>
      )}
    </section>
  );
}
