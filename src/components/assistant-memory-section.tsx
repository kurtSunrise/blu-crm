"use client";

import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createOrgMemoryAction,
  disableMemoryAction,
  updateMemoryAction,
} from "@/lib/actions/memory-actions";
// Type-only import from the server module: erased at compile time, so this
// stays a valid client component while both pages share one item shape.
import type { AssistantMemoryItem } from "@/lib/ai/memory";
import { formatDateAwst } from "@/lib/format";

const MAX_MEMORY_LENGTH = 500;

function CharacterCounter({ count, id }: { count: number; id: string }) {
  return (
    <p className="text-muted-foreground text-xs" id={id}>
      {count}/{MAX_MEMORY_LENGTH} characters
    </p>
  );
}

// Inline editor shared by the row's Edit mode. Owns its draft; the parent
// row swaps back to view mode on save or cancel.
function MemoryEditor({
  initialContent,
  memoryId,
  onCancel,
  onSaved,
}: {
  initialContent: string;
  memoryId: string;
  onCancel: () => void;
  onSaved: (content: string) => void;
}) {
  const [draft, setDraft] = useState(initialContent);
  const [isPending, startTransition] = useTransition();
  const fieldId = useId();
  const counterId = useId();

  const save = () => {
    const content = draft.trim();
    if (!content) {
      return;
    }
    startTransition(async () => {
      const result = await updateMemoryAction({ content, memoryId });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onSaved(content);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="sr-only" htmlFor={fieldId}>
        Memory text
      </Label>
      <Textarea
        aria-describedby={counterId}
        id={fieldId}
        maxLength={MAX_MEMORY_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        value={draft}
      />
      <CharacterCounter count={draft.length} id={counterId} />
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11 flex-1 sm:flex-none sm:px-6"
          disabled={isPending || draft.trim().length === 0}
          onClick={save}
          type="button"
        >
          {isPending ? (
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
          ) : null}
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          className="min-h-11"
          disabled={isPending}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Two-step delete confirm, matching the repo's inline destructive pattern
// (AttachmentDeleteButton): first tap swaps to Delete/Cancel, second commits.
function MemoryDeleteConfirm({
  memoryId,
  onCancel,
  onDeleted,
}: {
  memoryId: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      const result = await disableMemoryAction({ memoryId });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onDeleted();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-medium text-xs">Delete this memory?</p>
      <Button
        className="min-h-11"
        disabled={isPending}
        onClick={remove}
        type="button"
        variant="destructive"
      >
        {isPending ? "Deleting…" : "Delete"}
      </Button>
      <Button
        className="min-h-11"
        disabled={isPending}
        onClick={onCancel}
        type="button"
        variant="outline"
      >
        Cancel
      </Button>
    </div>
  );
}

function MemoryRow({
  canManage,
  memory,
  onDeleted,
}: {
  // Team-wide rows are view-only for non-admins; personal rows are always
  // the current user's own and stay editable.
  canManage: boolean;
  memory: AssistantMemoryItem;
  onDeleted: (memoryId: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [content, setContent] = useState(memory.content);
  const createdAt = new Date(memory.createdAt);
  const createdLabel = Number.isNaN(createdAt.getTime())
    ? null
    : formatDateAwst(createdAt);

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={memory.teamWide ? "secondary" : "outline"}>
          {memory.teamWide ? "Team-wide" : "Yours"}
        </Badge>
        {createdLabel ? (
          <span className="text-muted-foreground text-xs">
            Added {createdLabel}
          </span>
        ) : null}
        {canManage && mode === "view" ? (
          <span className="ml-auto flex items-center gap-1">
            <Button
              aria-label="Edit memory"
              className="size-11"
              onClick={() => setMode("edit")}
              size="icon"
              type="button"
              variant="ghost"
            >
              <PencilIcon aria-hidden className="size-4" />
            </Button>
            <Button
              aria-label="Delete memory"
              className="size-11 text-destructive"
              onClick={() => setMode("confirm-delete")}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2Icon aria-hidden className="size-4" />
            </Button>
          </span>
        ) : null}
      </div>
      {mode === "edit" ? (
        <MemoryEditor
          initialContent={content}
          memoryId={memory.id}
          onCancel={() => setMode("view")}
          onSaved={(next) => {
            setContent(next);
            setMode("view");
            toast.success("Memory updated");
          }}
        />
      ) : (
        <p className="break-words text-sm leading-relaxed">{content}</p>
      )}
      {mode === "confirm-delete" ? (
        <MemoryDeleteConfirm
          memoryId={memory.id}
          onCancel={() => setMode("view")}
          onDeleted={() => {
            onDeleted(memory.id);
            toast.success("Memory removed");
          }}
        />
      ) : null}
    </li>
  );
}

// Admin-only composer for a memory every teammate's assistant will use.
function AddTeamMemoryForm() {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const fieldId = useId();
  const counterId = useId();

  const add = () => {
    const content = draft.trim();
    if (!content) {
      return;
    }
    startTransition(async () => {
      const result = await createOrgMemoryAction({ content });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setDraft("");
      toast.success("Team-wide memory added");
      // The list is server-rendered; refresh pulls the new row in.
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <Label htmlFor={fieldId}>Add team-wide memory</Label>
      <Textarea
        aria-describedby={counterId}
        id={fieldId}
        maxLength={MAX_MEMORY_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="e.g. Always quote sheds in AUD including GST."
        rows={3}
        value={draft}
      />
      <CharacterCounter count={draft.length} id={counterId} />
      <Button
        className="min-h-11 sm:max-w-48"
        disabled={isPending || draft.trim().length === 0}
        onClick={add}
        type="button"
      >
        <PlusIcon aria-hidden className="size-4" />
        {isPending ? "Adding…" : "Add memory"}
      </Button>
    </div>
  );
}

// What the assistant remembers for this user (plus team-wide rows), rendered
// on /settings/ai for admins and /settings/account for everyone. Deleted
// rows hide locally so the list responds instantly; the next server render
// drops them for real (disable is a soft delete server-side).
export function AssistantMemorySection({
  canManageTeamMemories,
  memories,
}: {
  canManageTeamMemories: boolean;
  memories: AssistantMemoryItem[];
}) {
  const [hiddenIds, setHiddenIds] = useState<readonly string[]>([]);
  const visible = memories.filter((memory) => !hiddenIds.includes(memory.id));

  return (
    <div className="flex flex-col gap-3">
      {canManageTeamMemories ? <AddTeamMemoryForm /> : null}
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing remembered yet. The assistant saves useful facts as you chat,
          and you can remove them here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((memory) => (
            <MemoryRow
              canManage={canManageTeamMemories || !memory.teamWide}
              key={memory.id}
              memory={memory}
              onDeleted={(memoryId) =>
                setHiddenIds((current) => [...current, memoryId])
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
