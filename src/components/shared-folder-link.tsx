"use client";

import { ExternalLink, FolderOpen, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateDealSharedFolderUrl } from "@/lib/actions/deal-actions";

// A single OneDrive / shared-folder link per deal. Interim store for the deal's
// files until the Microsoft 365 integration lands.
export function SharedFolderLink({
  dealId,
  url,
}: {
  dealId: string;
  url: string | null;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await updateDealSharedFolderUrl({
        dealId,
        sharedFolderUrl: value.trim(),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setIsEditing(false);
      router.refresh();
    });
  };

  const cancel = () => {
    setValue(url ?? "");
    setError(null);
    setIsEditing(false);
  };

  if (!(isEditing || url)) {
    return (
      <Button
        className="h-11 w-fit gap-2"
        onClick={() => setIsEditing(true)}
        type="button"
        variant="outline"
      >
        <FolderOpen aria-hidden className="size-4" />
        Add shared folder link
      </Button>
    );
  }

  if (!isEditing && url) {
    return (
      <div className="flex items-center gap-2">
        <a
          className="flex min-w-0 items-center gap-2 text-blu text-sm underline-offset-2 hover:underline"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLink aria-hidden className="size-4 shrink-0" />
          <span className="truncate">Shared folder</span>
        </a>
        <Button
          aria-label="Edit shared folder link"
          className="size-9 shrink-0"
          onClick={() => setIsEditing(true)}
          type="button"
          variant="ghost"
        >
          <Pencil aria-hidden className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-muted-foreground text-xs" htmlFor="shared-folder">
        Shared folder link
      </Label>
      <Input
        className="h-11"
        id="shared-folder"
        inputMode="url"
        onChange={(event) => setValue(event.target.value)}
        placeholder="https://…"
        type="url"
        value={value}
      />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          className="h-11"
          disabled={isPending}
          onClick={save}
          type="button"
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          className="h-11"
          disabled={isPending}
          onClick={cancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
