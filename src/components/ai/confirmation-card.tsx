"use client";

import { useThreadRuntime } from "@assistant-ui/react";
import {
  CheckCircle2Icon,
  CheckIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export interface ConfirmationRequestData {
  input: unknown;
  summary: string;
  toolName: string;
  toolUseId: string;
}

const FIELD_KEY_PATTERN = /([a-z])([A-Z])/g;
const LONG_TEXT_THRESHOLD = 60;

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

const isEditable = (value: unknown): boolean =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

// Editable values travel as strings; the original value's type drives the
// conversion back at confirm time. The tool's zod schema re-validates the
// result server-side, so this only needs to be a best-effort parse.
const parseEdited = (original: unknown, raw: string): unknown => {
  if (typeof original === "boolean") {
    return raw === "true";
  }
  if (typeof original === "number") {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? original : parsed;
  }
  return raw;
};

const inputEntries = (input: unknown): [string, unknown][] =>
  Object.entries(
    typeof input === "object" && input !== null ? input : {}
  ).filter(([, value]) => formatValue(value).length > 0);

const buildFinalInput = (
  input: unknown,
  edits: Record<string, string>
): { changed: boolean; finalInput: Record<string, unknown> } => {
  const base =
    typeof input === "object" && input !== null
      ? { ...(input as Record<string, unknown>) }
      : {};
  for (const [key, raw] of Object.entries(edits)) {
    if (raw.trim() === "") {
      // Cleared field on an optional input: omit rather than send ""
      delete base[key];
    } else {
      base[key] = parseEdited((input as Record<string, unknown>)[key], raw);
    }
  }
  const changed = JSON.stringify(base) !== JSON.stringify(input);
  return { changed, finalInput: base };
};

function FieldEditor({
  id,
  onChange,
  original,
  value,
}: {
  id: string;
  onChange: (raw: string) => void;
  original: unknown;
  value: string;
}) {
  if (typeof original === "boolean") {
    return (
      <NativeSelect
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </NativeSelect>
    );
  }
  if (typeof original === "number") {
    return (
      <Input
        id={id}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
    );
  }
  const isLong = value.length > LONG_TEXT_THRESHOLD || value.includes("\n");
  if (isLong) {
    return (
      <Textarea
        id={id}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        value={value}
      />
    );
  }
  return (
    <Input
      id={id}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  );
}

const initialEdits = (input: unknown): Record<string, string> => {
  const edits: Record<string, string> = {};
  for (const [key, value] of inputEntries(input)) {
    if (isEditable(value)) {
      edits[key] = String(value);
    }
  }
  return edits;
};

// Review card for a gated write (FR-7.8): shows exactly what the assistant
// wants to change, and every primitive field can be adjusted before
// confirming (two-way sync). Nothing is applied until Confirm; edited
// values ride the confirmation POST as finalInput and are re-validated by
// the tool's own zod schema server-side. The user bubble ("Approve" /
// "Cancel") keeps the thread history honest.
export function ConfirmationCard({ data }: { data: ConfirmationRequestData }) {
  const { decisionRef, pendingConfirmation } = useAiAssistant();
  const threadRuntime = useThreadRuntime();
  const fieldIdPrefix = useId();
  const [resolved, setResolved] = useState<"approved" | "cancelled" | null>(
    null
  );
  const [edits, setEdits] = useState<Record<string, string>>(() =>
    initialEdits(data.input)
  );

  // Only the live pending request is actionable; cards from history or a
  // superseded request render inert.
  const actionable =
    resolved === null && pendingConfirmation?.toolUseId === data.toolUseId;

  const decide = (approved: boolean) => {
    const { changed, finalInput } = buildFinalInput(data.input, edits);
    // Written synchronously so the run triggered by append() sees it.
    decisionRef.current = {
      approved,
      finalInput: approved && changed ? finalInput : undefined,
      toolUseId: data.toolUseId,
    };
    setResolved(approved ? "approved" : "cancelled");
    threadRuntime.append(approved ? "Approve" : "Cancel");
  };

  const fields = inputEntries(data.input);

  return (
    <section
      aria-label={`Confirm: ${data.summary}`}
      className="my-2 rounded-lg border border-warning/40 bg-warning/5 p-3"
    >
      <div className="flex items-center gap-2">
        <ShieldAlertIcon aria-hidden className="size-4 shrink-0 text-warning" />
        <h3 className="font-medium text-sm">{data.summary}</h3>
      </div>

      {actionable && fields.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2.5">
          {fields.map(([key, value]) => {
            const id = `${fieldIdPrefix}-${key}`;
            return (
              <div className="flex flex-col gap-1" key={key}>
                <Label
                  className="text-muted-foreground text-xs capitalize"
                  htmlFor={id}
                >
                  {humanizeKey(key)}
                </Label>
                {isEditable(value) ? (
                  <FieldEditor
                    id={id}
                    onChange={(raw) =>
                      setEdits((current) => ({ ...current, [key]: raw }))
                    }
                    original={value}
                    value={edits[key] ?? ""}
                  />
                ) : (
                  <p className="break-words text-sm" id={id}>
                    {formatValue(value)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {!actionable && fields.length > 0 ? (
        // Resolved cards show what was actually decided, edits included.
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {inputEntries(buildFinalInput(data.input, edits).finalInput).map(
            ([key, value]) => (
              <div className="flex flex-col" key={key}>
                <dt className="text-muted-foreground text-xs capitalize">
                  {humanizeKey(key)}
                </dt>
                <dd className="break-words text-sm">{formatValue(value)}</dd>
              </div>
            )
          )}
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
          <p
            className="flex items-center gap-1.5 text-muted-foreground text-xs"
            role="status"
          >
            {resolved === "approved" && (
              <>
                <CheckCircle2Icon
                  aria-hidden
                  className="size-3.5 text-success"
                />
                <span className="text-success">Approved</span>
              </>
            )}
            {resolved === "cancelled" && "Cancelled, nothing was changed"}
            {resolved === null && "Resolved"}
          </p>
        )}
      </div>
    </section>
  );
}
