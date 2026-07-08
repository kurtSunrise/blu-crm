"use client";

import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteKnowledgeDocAction,
  saveKnowledgeDocAction,
} from "@/lib/actions/knowledge-actions";
import {
  KNOWLEDGE_CATEGORY_MAX,
  KNOWLEDGE_CONTENT_MAX,
  KNOWLEDGE_TITLE_MAX,
} from "@/lib/validation/knowledge";

// Admin CRUD for the assistant's knowledge corpus on /settings/knowledge.
// The page passes server-rendered rows; edits happen in an inline editor and
// a router.refresh() after each write pulls the fresh list (the save action
// revalidates the path).

export interface KnowledgeDocItem {
  category: string | null;
  chunkCount: number;
  content: string;
  embeddedCount: number;
  id: string;
  title: string;
  updatedAtLabel: string;
}

const sectionsLabel = (count: number): string =>
  `${count} section${count === 1 ? "" : "s"}`;

function CharacterCounter({ count, id }: { count: number; id: string }) {
  return (
    <p className="text-muted-foreground text-xs" id={id}>
      {count.toLocaleString("en-AU")}/
      {KNOWLEDGE_CONTENT_MAX.toLocaleString("en-AU")} characters
    </p>
  );
}

// Shared by "New document" and per-row Edit. Category is free text backed by
// a datalist of the categories already in use, so existing groupings are one
// tap away without blocking new ones.
function DocEditor({
  categories,
  initial,
  onCancel,
  onSaved,
}: {
  categories: string[];
  initial: KnowledgeDocItem | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [isPending, startTransition] = useTransition();
  const titleId = useId();
  const categoryId = useId();
  const categoryListId = useId();
  const contentId = useId();
  const counterId = useId();

  const canSave = title.trim().length > 0 && content.trim().length > 0;

  const save = () => {
    if (!canSave) {
      return;
    }
    startTransition(async () => {
      const result = await saveKnowledgeDocAction({
        category: category.trim(),
        content: content.trim(),
        id: initial?.id,
        title: title.trim(),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const chunkCount = result.chunkCount ?? 0;
      const embeddedCount = result.embeddedCount ?? 0;
      toast.success(
        `Saved: ${sectionsLabel(chunkCount)}, ${embeddedCount} embedded`
      );
      onSaved();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          maxLength={KNOWLEDGE_TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Quoting and pricing rules"
          value={title}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={categoryId}>Category (optional)</Label>
        <Input
          id={categoryId}
          list={categoryListId}
          maxLength={KNOWLEDGE_CATEGORY_MAX}
          onChange={(event) => setCategory(event.target.value)}
          placeholder="e.g. sales"
          value={category}
        />
        <datalist id={categoryListId}>
          {categories.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={contentId}>Content (markdown)</Label>
        <Textarea
          aria-describedby={counterId}
          className="min-h-56 font-mono text-sm"
          id={contentId}
          maxLength={KNOWLEDGE_CONTENT_MAX}
          onChange={(event) => setContent(event.target.value)}
          placeholder={
            "Intro text, then split sections with ## headings.\n\n## First topic\nWhat the assistant should know about it."
          }
          value={content}
        />
        <CharacterCounter count={content.length} id={counterId} />
        <p className="text-muted-foreground text-xs">
          Each "## heading" starts a new section. The assistant searches
          sections, so smaller focused sections give better answers.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11 flex-1 sm:flex-none sm:px-6"
          disabled={isPending || !canSave}
          onClick={save}
          type="button"
        >
          {isPending ? (
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
          ) : null}
          {isPending ? "Saving…" : "Save document"}
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

// Two-step delete confirm, matching the repo's inline destructive pattern:
// first tap swaps to Delete/Cancel, second commits.
function DocDeleteConfirm({
  docId,
  onCancel,
  onDeleted,
}: {
  docId: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      const result = await deleteKnowledgeDocAction({ id: docId });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onDeleted();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-medium text-xs">
        Delete this document? The assistant stops using it straight away.
      </p>
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

function DocRow({
  categories,
  doc,
  onDeleted,
}: {
  categories: string[];
  doc: KnowledgeDocItem;
  onDeleted: (docId: string) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium text-sm">{doc.title}</p>
          <p className="text-muted-foreground text-xs">
            Updated {doc.updatedAtLabel} · {sectionsLabel(doc.chunkCount)},{" "}
            {doc.embeddedCount} embedded
          </p>
        </div>
        {doc.category ? <Badge variant="outline">{doc.category}</Badge> : null}
        {mode === "view" ? (
          <span className="flex items-center gap-1">
            <Button
              aria-label={`Edit ${doc.title}`}
              className="size-11"
              onClick={() => setMode("edit")}
              size="icon"
              type="button"
              variant="ghost"
            >
              <PencilIcon aria-hidden className="size-4" />
            </Button>
            <Button
              aria-label={`Delete ${doc.title}`}
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
        <DocEditor
          categories={categories}
          initial={doc}
          onCancel={() => setMode("view")}
          onSaved={() => {
            setMode("view");
            router.refresh();
          }}
        />
      ) : null}
      {mode === "confirm-delete" ? (
        <DocDeleteConfirm
          docId={doc.id}
          onCancel={() => setMode("view")}
          onDeleted={() => {
            onDeleted(doc.id);
            toast.success("Document deleted");
            router.refresh();
          }}
        />
      ) : null}
    </li>
  );
}

export function KnowledgeDocEditor({
  categories,
  docs,
}: {
  categories: string[];
  docs: KnowledgeDocItem[];
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  // Deleted rows hide locally so the list responds instantly; the refresh
  // that follows drops them for real.
  const [hiddenIds, setHiddenIds] = useState<readonly string[]>([]);
  const visible = docs.filter((doc) => !hiddenIds.includes(doc.id));

  return (
    <div className="flex flex-col gap-3">
      {isCreating ? (
        <div className="rounded-lg border border-dashed p-3">
          <DocEditor
            categories={categories}
            initial={null}
            onCancel={() => setIsCreating(false)}
            onSaved={() => {
              setIsCreating(false);
              router.refresh();
            }}
          />
        </div>
      ) : (
        <Button
          className="min-h-11 sm:max-w-56"
          onClick={() => setIsCreating(true)}
          type="button"
        >
          <PlusIcon aria-hidden className="size-4" />
          New document
        </Button>
      )}
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No knowledge documents yet. This library is what the assistant
          searches when it answers questions about pricing, process, and how Blu
          Builders works. Add a document to give it something to draw on.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((doc) => (
            <DocRow
              categories={categories}
              doc={doc}
              key={doc.id}
              onDeleted={(docId) =>
                setHiddenIds((current) => [...current, docId])
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
