"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  manageStages,
  type StageActionState,
} from "@/lib/actions/stage-actions";

export interface ManagedStage {
  dealCount: number;
  id: string;
  isLost: boolean;
  isWon: boolean;
  name: string;
}

const MAX_STAGE_NAME_LENGTH = 60;

const isClosed = (stage: ManagedStage): boolean => stage.isWon || stage.isLost;

const dealCountLabel = (count: number): string =>
  count === 1 ? "1 deal" : `${count} deals`;

export function StageManager({ stages }: { stages: ManagedStage[] }) {
  const [state, formAction, isPending] = useActionState<
    StageActionState,
    FormData
  >(manageStages, {});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const addFormRef = useRef<HTMLFormElement>(null);

  // A success means the server state moved on; close any open panel and
  // clear the add field so the list reads fresh.
  useEffect(() => {
    if (state.message) {
      setEditingId(null);
      setRemovingId(null);
      addFormRef.current?.reset();
    }
  }, [state]);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {stages.map((stage, index) => {
          const previous = stages[index - 1];
          const next = stages[index + 1];
          const canMoveUp =
            previous !== undefined && isClosed(previous) === isClosed(stage);
          const canMoveDown =
            next !== undefined && isClosed(next) === isClosed(stage);

          return (
            <li
              className="flex flex-col gap-3 rounded-lg border p-3"
              key={stage.id}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{stage.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {dealCountLabel(stage.dealCount)}
                  </p>
                </div>
                {isClosed(stage) && (
                  <Badge variant="outline">
                    {stage.isWon ? "Won stage" : "Lost stage"}
                  </Badge>
                )}
                <div className="flex shrink-0 gap-1">
                  <form action={formAction}>
                    <input name="intent" type="hidden" value="move" />
                    <input name="stageId" type="hidden" value={stage.id} />
                    <input name="direction" type="hidden" value="up" />
                    <Button
                      aria-label={`Move ${stage.name} up`}
                      className="size-11"
                      disabled={!canMoveUp || isPending}
                      size="icon"
                      type="submit"
                      variant="ghost"
                    >
                      <ArrowUp aria-hidden className="size-4" />
                    </Button>
                  </form>
                  <form action={formAction}>
                    <input name="intent" type="hidden" value="move" />
                    <input name="stageId" type="hidden" value={stage.id} />
                    <input name="direction" type="hidden" value="down" />
                    <Button
                      aria-label={`Move ${stage.name} down`}
                      className="size-11"
                      disabled={!canMoveDown || isPending}
                      size="icon"
                      type="submit"
                      variant="ghost"
                    >
                      <ArrowDown aria-hidden className="size-4" />
                    </Button>
                  </form>
                  <Button
                    aria-label={`Rename ${stage.name}`}
                    className="size-11"
                    onClick={() => {
                      setEditingId(editingId === stage.id ? null : stage.id);
                      setRemovingId(null);
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil aria-hidden className="size-4" />
                  </Button>
                  {!isClosed(stage) && (
                    <Button
                      aria-label={`Remove ${stage.name}`}
                      className="size-11 text-destructive"
                      onClick={() => {
                        setRemovingId(
                          removingId === stage.id ? null : stage.id
                        );
                        setEditingId(null);
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              {editingId === stage.id && (
                <form
                  action={formAction}
                  className="flex flex-wrap items-end gap-2 border-t pt-3"
                >
                  <input name="intent" type="hidden" value="rename" />
                  <input name="stageId" type="hidden" value={stage.id} />
                  <div className="flex min-w-40 flex-1 flex-col gap-2">
                    <Label htmlFor={`stage-name-${stage.id}`}>
                      New name for {stage.name}
                    </Label>
                    <Input
                      className="h-11"
                      defaultValue={stage.name}
                      id={`stage-name-${stage.id}`}
                      maxLength={MAX_STAGE_NAME_LENGTH}
                      name="name"
                      required
                    />
                  </div>
                  <Button className="h-11" disabled={isPending} type="submit">
                    Save name
                  </Button>
                  <Button
                    className="h-11"
                    onClick={() => setEditingId(null)}
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </form>
              )}

              {removingId === stage.id && (
                <form
                  action={formAction}
                  className="flex flex-col gap-3 border-t pt-3"
                >
                  <input name="intent" type="hidden" value="delete" />
                  <input name="stageId" type="hidden" value={stage.id} />
                  {stage.dealCount > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm">
                        This stage has {dealCountLabel(stage.dealCount)},
                        including any discarded ones. Choose where they go
                        before removing it.
                      </p>
                      <Label htmlFor={`reassign-${stage.id}`}>
                        Move its deals to
                      </Label>
                      <NativeSelect
                        defaultValue=""
                        id={`reassign-${stage.id}`}
                        name="reassignToStageId"
                        required
                      >
                        <option disabled value="">
                          Choose a stage…
                        </option>
                        {stages
                          .filter((other) => other.id !== stage.id)
                          .map((other) => (
                            <option key={other.id} value={other.id}>
                              {other.name}
                            </option>
                          ))}
                      </NativeSelect>
                    </div>
                  ) : (
                    <p className="text-sm">
                      No deals reference this stage. Removing it can't be
                      undone.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="h-11"
                      disabled={isPending}
                      type="submit"
                      variant="destructive"
                    >
                      Remove stage
                    </Button>
                    <Button
                      className="h-11"
                      onClick={() => setRemovingId(null)}
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      {state.message && !state.error && (
        <p className="text-sm" role="status">
          {state.message}
        </p>
      )}

      <form
        action={formAction}
        className="flex flex-wrap items-end gap-2 border-t pt-4"
        ref={addFormRef}
      >
        <input name="intent" type="hidden" value="add" />
        <div className="flex min-w-40 flex-1 flex-col gap-2">
          <Label htmlFor="new-stage-name">New stage name</Label>
          <Input
            className="h-11"
            id="new-stage-name"
            maxLength={MAX_STAGE_NAME_LENGTH}
            name="name"
            placeholder="e.g. Contract Signed"
            required
          />
        </div>
        <Button className="h-11" disabled={isPending} type="submit">
          Add stage
        </Button>
      </form>
    </div>
  );
}
