"use client";

import { useThreadRuntime } from "@assistant-ui/react";
import {
  CheckCircle2Icon,
  CheckIcon,
  MinusCircleIcon,
  ShieldAlertIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ConfirmationItem } from "@/lib/ai/stream-protocol";
import { cn } from "@/lib/utils";

// Status a card carries when rehydrated from a resumed thread's transcript;
// anything other than a live pending plan renders inert.
export type ResumedConfirmationStatus =
  | "approved"
  | "denied"
  | "failed"
  | "skipped"
  | "unresolved";

export interface ConfirmationRequestData {
  // Per-item audited outcomes for a resumed, already-resolved plan. Items in
  // one plan can end differently (executed, denied, skipped after a failure),
  // so the card-level resumedStatus alone cannot describe them.
  itemStatuses?: Record<string, ResumedConfirmationStatus>;
  items: ConfirmationItem[];
  resumedStatus?: ResumedConfirmationStatus;
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

type EditsByItem = Record<string, Record<string, string>>;

const initialEdits = (items: ConfirmationItem[]): EditsByItem => {
  const byItem: EditsByItem = {};
  for (const item of items) {
    const edits: Record<string, string> = {};
    for (const [key, value] of inputEntries(item.input)) {
      if (isEditable(value)) {
        edits[key] = String(value);
      }
    }
    byItem[item.toolUseId] = edits;
  }
  return byItem;
};

// Editable field stack for one plan item (two-way sync). Nothing is applied
// until Confirm; edited values ride the confirmation POST as finalInput and
// are re-validated by the tool's own zod schema server-side.
function ItemFieldEditors({
  edits,
  idPrefix,
  item,
  onEdit,
}: {
  edits: Record<string, string>;
  idPrefix: string;
  item: ConfirmationItem;
  onEdit: (key: string, raw: string) => void;
}) {
  const fields = inputEntries(item.input);
  if (fields.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-col gap-2.5">
      {fields.map(([key, value]) => {
        const id = `${idPrefix}-${item.toolUseId}-${key}`;
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
                onChange={(raw) => onEdit(key, raw)}
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
  );
}

// Read-only field summary for resolved and resumed cards.
function ItemFieldSummary({ input }: { input: unknown }) {
  const fields = inputEntries(input);
  if (fields.length === 0) {
    return null;
  }
  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {fields.map(([key, value]) => (
        <div className="flex flex-col" key={key}>
          <dt className="text-muted-foreground text-xs capitalize">
            {humanizeKey(key)}
          </dt>
          <dd className="break-words text-sm">{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusLine({
  status,
}: {
  status: ResumedConfirmationStatus | "cancelled";
}) {
  if (status === "approved") {
    return (
      <p
        className="flex items-center gap-1.5 text-success text-xs"
        role="status"
      >
        <CheckCircle2Icon aria-hidden className="size-3.5" />
        Approved
      </p>
    );
  }
  if (status === "failed") {
    return (
      <p
        className="flex items-center gap-1.5 text-destructive text-xs"
        role="status"
      >
        <XCircleIcon aria-hidden className="size-3.5" />
        Failed
      </p>
    );
  }
  const label = {
    cancelled: "Cancelled, nothing was changed",
    denied: "Cancelled, nothing was changed",
    skipped: "Skipped",
    unresolved: "Expired",
  }[status];
  return (
    <p
      className="flex items-center gap-1.5 text-muted-foreground text-xs"
      role="status"
    >
      <MinusCircleIcon aria-hidden className="size-3.5" />
      {label}
    </p>
  );
}

// Review card for gated writes (FR-7.8). A multi-step plan renders as an
// ordered checklist: every item shows exactly what the assistant wants to
// change, every primitive field can be adjusted, and each item can be
// included or skipped. One Confirm applies the whole review; Cancel denies
// everything. The user bubble ("Approve" / "Cancel") keeps the thread
// history honest.
export function ConfirmationCard({ data }: { data: ConfirmationRequestData }) {
  const { decisionRef, pendingConfirmation } = useAiAssistant();
  const threadRuntime = useThreadRuntime();
  const fieldIdPrefix = useId();
  const [resolved, setResolved] = useState<"approved" | "cancelled" | null>(
    null
  );
  const [edits, setEdits] = useState<EditsByItem>(() =>
    initialEdits(data.items)
  );
  const [skippedIds, setSkippedIds] = useState<Record<string, boolean>>({});

  const firstToolUseId = data.items[0]?.toolUseId;
  const multi = data.items.length > 1;

  // Only the live pending plan is actionable; cards from history or a
  // superseded request render inert. Resumed pending cards become actionable
  // because the launcher re-seeds pendingConfirmation from the thread's
  // pendingToolUses.
  const actionable =
    resolved === null &&
    data.resumedStatus === undefined &&
    data.itemStatuses === undefined &&
    pendingConfirmation !== null &&
    pendingConfirmation.items[0]?.toolUseId === firstToolUseId;

  const includedCount = data.items.filter(
    (item) => !skippedIds[item.toolUseId]
  ).length;

  const decide = (approved: boolean) => {
    const decisions = data.items.map((item) => {
      const include = approved && !skippedIds[item.toolUseId];
      const { changed, finalInput } = buildFinalInput(
        item.input,
        edits[item.toolUseId] ?? {}
      );
      return {
        approved: include,
        finalInput: include && changed ? finalInput : undefined,
        toolUseId: item.toolUseId,
      };
    });
    // Written synchronously so the run triggered by append() sees it.
    decisionRef.current = { decisions };
    setResolved(approved ? "approved" : "cancelled");
    threadRuntime.append(approved ? "Approve" : "Cancel");
  };

  const itemStatus = (
    item: ConfirmationItem
  ): ResumedConfirmationStatus | "cancelled" => {
    const resumed = data.itemStatuses?.[item.toolUseId] ?? data.resumedStatus;
    if (resumed) {
      return resumed;
    }
    if (resolved === "approved") {
      return skippedIds[item.toolUseId] ? "skipped" : "approved";
    }
    // Covers an explicit Cancel and a card gone stale because a newer message
    // superseded the plan; the server denies superseded items, so "cancelled"
    // is what actually happened.
    return "cancelled";
  };

  return (
    <section
      aria-label={
        multi
          ? `Confirm ${data.items.length} changes`
          : `Confirm: ${data.items[0]?.summary ?? "change"}`
      }
      className="my-2 rounded-lg border border-warning/40 bg-warning/5 p-3"
    >
      <div className="flex items-center gap-2">
        <ShieldAlertIcon aria-hidden className="size-4 shrink-0 text-warning" />
        <h3 className="font-medium text-sm">
          {multi
            ? `Review ${data.items.length} proposed changes`
            : (data.items[0]?.summary ?? "Review this change")}
        </h3>
      </div>

      <ol className={cn("flex flex-col", multi && "mt-1 divide-y")}>
        {data.items.map((item) => {
          const skipped = skippedIds[item.toolUseId] === true;
          const toggleId = `${fieldIdPrefix}-${item.toolUseId}-include`;
          return (
            <li className={cn(multi && "py-2.5")} key={item.toolUseId}>
              {multi ? (
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={cn(
                      "font-medium text-sm",
                      skipped && "text-muted-foreground line-through"
                    )}
                  >
                    {item.summary}
                  </p>
                  {actionable ? (
                    <label
                      className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-muted-foreground text-xs"
                      htmlFor={toggleId}
                    >
                      <input
                        checked={!skipped}
                        className="size-5 accent-blu"
                        id={toggleId}
                        onChange={(event) =>
                          setSkippedIds((current) => ({
                            ...current,
                            [item.toolUseId]: !event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      Include
                    </label>
                  ) : null}
                </div>
              ) : null}

              {actionable && !skipped ? (
                <ItemFieldEditors
                  edits={edits[item.toolUseId] ?? {}}
                  idPrefix={fieldIdPrefix}
                  item={item}
                  onEdit={(key, raw) =>
                    setEdits((current) => ({
                      ...current,
                      [item.toolUseId]: {
                        ...current[item.toolUseId],
                        [key]: raw,
                      },
                    }))
                  }
                />
              ) : null}

              {!actionable || skipped ? (
                // Resolved, resumed, or skipped items show what was actually
                // decided, edits included.
                <div className={cn(skipped && "opacity-60")}>
                  <ItemFieldSummary
                    input={
                      buildFinalInput(item.input, edits[item.toolUseId] ?? {})
                        .finalInput
                    }
                  />
                  {actionable ? null : (
                    <div className="mt-2">
                      <StatusLine status={itemStatus(item)} />
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {actionable ? (
        <div className="mt-3 flex items-center gap-2">
          <Button
            className="min-h-11 flex-1"
            disabled={includedCount === 0}
            onClick={() => decide(true)}
            type="button"
          >
            <CheckIcon aria-hidden className="size-4" />
            {multi ? `Confirm ${includedCount}` : "Confirm"}
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
        </div>
      ) : null}
    </section>
  );
}
