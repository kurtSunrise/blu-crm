"use client";

import { ArchiveRestore, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SettingsActionState } from "@/lib/actions/settings-actions";
import {
  archiveSubStatus,
  createSubStatus,
  reorderSubStatuses,
  restoreSubStatus,
  updateSubStatus,
  updateSubStatusPlacement,
} from "@/lib/actions/sub-status-actions";
import {
  SUB_STATUS_COLOR_HINTS,
  SUB_STATUS_COLORS,
  SUB_STATUS_PALETTE,
  type SubStatusColor,
  subStatusClasses,
} from "@/lib/labels";
import type { AdminSubStatus } from "@/lib/sub-statuses";
import { cn } from "@/lib/utils";

const MAX_LABEL_LENGTH = 60;
const DEFAULT_NEW_COLOR: SubStatusColor = "slate";

interface PlacementProps {
  showOnBoard: boolean;
  showOnDealPage: boolean;
}

interface DealStatusesFormProps {
  placement: PlacementProps;
  statuses: AdminSubStatus[];
}

// Shared feedback line under each form. Kept generic so every section reuses it.
function ActionFeedback({
  state,
  savedMessage,
}: {
  state: SettingsActionState;
  savedMessage: string;
}) {
  if (state.error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p className="text-sm" role="status">
        {savedMessage}
      </p>
    );
  }
  return null;
}

// The fixed palette as a row of selectable swatches. The chosen colour posts via
// a hidden input named `color`, so this sits inside a parent <form>.
function ColorPicker({
  value,
  onChange,
}: {
  value: SubStatusColor;
  onChange: (color: SubStatusColor) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-muted-foreground text-xs">Colour</legend>
      <div className="flex flex-wrap gap-2">
        {SUB_STATUS_COLORS.map((color) => {
          const selected = color === value;
          return (
            <label
              className={cn(
                "flex size-11 cursor-pointer items-center justify-center rounded-md border-2 transition-colors focus-within:ring-2 focus-within:ring-ring",
                selected
                  ? "border-foreground"
                  : "border-transparent hover:border-border"
              )}
              key={color}
              title={`${color}: ${SUB_STATUS_COLOR_HINTS[color]}`}
            >
              <input
                aria-label={`${color}: ${SUB_STATUS_COLOR_HINTS[color]}`}
                checked={selected}
                className="sr-only"
                name="color"
                onChange={() => onChange(color)}
                type="radio"
                value={color}
              />
              <span
                className={cn(
                  "size-5 rounded-full",
                  SUB_STATUS_PALETTE[color].dot
                )}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// A live preview of the badge the way it renders on cards and the board.
function BadgePreview({
  color,
  label,
}: {
  color: SubStatusColor;
  label: string;
}) {
  const text = label.trim().length > 0 ? label.trim() : "Status name";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-4xl border px-2 py-0.5 font-medium text-xs",
        subStatusClasses(color).badge
      )}
    >
      <span
        className={cn("size-2 rounded-full", subStatusClasses(color).dot)}
      />
      {text}
    </span>
  );
}

// One editable active status. Its own form so Save and Archive are per-row.
function StatusRow({
  status,
  position,
  total,
  onMove,
}: {
  status: AdminSubStatus;
  position: number;
  total: number;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateSubStatus, {});
  const [archiveState, archiveAction, isArchiving] = useActionState<
    SettingsActionState,
    FormData
  >(archiveSubStatus, {});
  const [color, setColor] = useState<SubStatusColor>(
    status.color as SubStatusColor
  );
  const [label, setLabel] = useState(status.label);
  const labelId = useId();
  const isFirst = position === 0;
  const isLast = position === total - 1;

  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-background p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1">
          <Button
            aria-label={`Move ${status.label} up`}
            className="size-11"
            disabled={isFirst}
            onClick={() => onMove(status.id, -1)}
            size="icon"
            type="button"
            variant="outline"
          >
            <ChevronUp aria-hidden className="size-5" />
          </Button>
          <Button
            aria-label={`Move ${status.label} down`}
            className="size-11"
            disabled={isLast}
            onClick={() => onMove(status.id, 1)}
            size="icon"
            type="button"
            variant="outline"
          >
            <ChevronDown aria-hidden className="size-5" />
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <BadgePreview color={color} label={label} />
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <input name="id" type="hidden" value={status.id} />
        <div className="flex flex-col gap-1.5">
          <label className="text-muted-foreground text-xs" htmlFor={labelId}>
            Label
          </label>
          <input
            className="h-12 rounded-md border bg-background px-3 text-base"
            id={labelId}
            maxLength={MAX_LABEL_LENGTH}
            name="label"
            onChange={(event) => setLabel(event.target.value)}
            type="text"
            value={label}
          />
        </div>
        <ColorPicker onChange={setColor} value={color} />
        <ActionFeedback savedMessage="Status saved." state={state} />
        <div className="flex flex-wrap gap-2">
          <Button className="h-12 flex-1" disabled={isPending} type="submit">
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      <form action={archiveAction}>
        <input name="id" type="hidden" value={status.id} />
        <ActionFeedback savedMessage="Status archived." state={archiveState} />
        <Button
          className="h-11 w-full"
          disabled={isArchiving}
          type="submit"
          variant="outline"
        >
          {isArchiving ? "Archiving…" : "Archive"}
        </Button>
      </form>
    </li>
  );
}

// The hidden-input form that persists a reordering. Submitted via the ref when
// the user moves a row, so the new order is saved without an extra button press.
function ReorderForm({
  orderedIds,
  formRef,
}: {
  orderedIds: string[];
  formRef: React.RefObject<HTMLFormElement | null>;
}) {
  const [state, formAction] = useActionState<SettingsActionState, FormData>(
    reorderSubStatuses,
    {}
  );
  return (
    <form action={formAction} ref={formRef}>
      <input
        name="orderedIds"
        type="hidden"
        value={JSON.stringify(orderedIds)}
      />
      <ActionFeedback savedMessage="Order saved." state={state} />
    </form>
  );
}

// Active statuses: reorder with up/down, edit and archive inline.
function ActiveStatusList({ statuses }: { statuses: AdminSubStatus[] }) {
  const [orderedIds, setOrderedIds] = useState<string[]>(
    statuses.map((status) => status.id)
  );
  const formRef = useRef<HTMLFormElement>(null);
  const lastSavedOrder = useRef(orderedIds.join(","));

  // Persist the new order once React has re-rendered the hidden input with it.
  // Comparing against the last saved order skips the initial mount and any
  // no-op change, so a page load never posts a redundant reorder.
  useEffect(() => {
    const current = orderedIds.join(",");
    if (current !== lastSavedOrder.current) {
      lastSavedOrder.current = current;
      formRef.current?.requestSubmit();
    }
  }, [orderedIds]);

  const move = (id: string, direction: -1 | 1) => {
    setOrderedIds((current) => {
      const index = current.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const byId = new Map(statuses.map((status) => [status.id, status]));
  const ordered = orderedIds
    .map((id) => byId.get(id))
    .filter((status): status is AdminSubStatus => status !== undefined);

  if (ordered.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No active statuses yet. Add one below.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ReorderForm formRef={formRef} orderedIds={orderedIds} />
      <ul className="flex flex-col gap-3">
        {ordered.map((status, index) => (
          <StatusRow
            key={status.id}
            onMove={move}
            position={index}
            status={status}
            total={ordered.length}
          />
        ))}
      </ul>
    </div>
  );
}

// Create a new status. Resets its inputs after a successful save.
function AddStatusForm() {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(createSubStatus, {});
  const [color, setColor] = useState<SubStatusColor>(DEFAULT_NEW_COLOR);
  const [label, setLabel] = useState("");
  const labelId = useId();

  useEffect(() => {
    if (state.saved) {
      setLabel("");
      setColor(DEFAULT_NEW_COLOR);
    }
  }, [state.saved]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <BadgePreview color={color} label={label} />
      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs" htmlFor={labelId}>
          New status label
        </label>
        <input
          className="h-12 rounded-md border bg-background px-3 text-base"
          id={labelId}
          maxLength={MAX_LABEL_LENGTH}
          name="label"
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. On hold"
          type="text"
          value={label}
        />
      </div>
      <ColorPicker onChange={setColor} value={color} />
      <ActionFeedback savedMessage="Status added." state={state} />
      <Button className="h-12 sm:max-w-48" disabled={isPending} type="submit">
        <Plus aria-hidden className="size-4" />
        {isPending ? "Adding…" : "Add status"}
      </Button>
    </form>
  );
}

// One archived status, read-only with a Restore action.
function ArchivedStatusRow({ status }: { status: AdminSubStatus }) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(restoreSubStatus, {});
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <BadgePreview
          color={status.color as SubStatusColor}
          label={status.label}
        />
        <form action={formAction}>
          <input name="id" type="hidden" value={status.id} />
          <Button
            className="h-11"
            disabled={isPending}
            type="submit"
            variant="outline"
          >
            <ArchiveRestore aria-hidden className="size-4" />
            {isPending ? "Restoring…" : "Restore"}
          </Button>
        </form>
      </div>
      <ActionFeedback savedMessage="Status restored." state={state} />
    </li>
  );
}

function ArchivedStatusList({ statuses }: { statuses: AdminSubStatus[] }) {
  if (statuses.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-heading font-semibold text-base">
          Archived statuses
        </h3>
        <p className="text-muted-foreground text-sm">
          Archived statuses stay on deals that already use them but are hidden
          from the picker. Restore one to offer it again.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {statuses.map((status) => (
          <ArchivedStatusRow key={status.id} status={status} />
        ))}
      </ul>
    </section>
  );
}

// Where the per-deal status control appears. Mirrors the tooltip form's checkbox
// + Save pattern.
function PlacementForm({ placement }: { placement: PlacementProps }) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateSubStatusPlacement, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Turning a surface off leaves a read-only badge there, so the status is
        still visible but cannot be changed from that screen.
      </p>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          className="size-5 accent-blu"
          defaultChecked={placement.showOnBoard}
          name="showOnBoard"
          type="checkbox"
        />
        Show the status control on the pipeline board
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          className="size-5 accent-blu"
          defaultChecked={placement.showOnDealPage}
          name="showOnDealPage"
          type="checkbox"
        />
        Show the status control on the deal page
      </label>
      <ActionFeedback savedMessage="Placement saved." state={state} />
      <Button className="h-12 sm:max-w-48" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save placement"}
      </Button>
    </form>
  );
}

export function DealStatusesForm({
  placement,
  statuses,
}: DealStatusesFormProps) {
  const active = statuses.filter((status) => status.archivedAt === null);
  const archived = statuses.filter((status) => status.archivedAt !== null);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="font-heading font-semibold text-base">
          Active statuses
        </h3>
        <ActiveStatusList statuses={active} />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-heading font-semibold text-base">Add a status</h3>
        <AddStatusForm />
      </section>

      <ArchivedStatusList statuses={archived} />

      <section className="flex flex-col gap-3">
        <h3 className="font-heading font-semibold text-base">
          Where it appears
        </h3>
        <PlacementForm placement={placement} />
      </section>
    </div>
  );
}
