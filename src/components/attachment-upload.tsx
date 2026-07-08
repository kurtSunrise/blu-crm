"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Mobile-first upload (FR-10): one large target that opens the camera or
// file picker; posts straight to the attachments endpoint. Multiple files can
// be selected at once and are uploaded one request at a time (the endpoint
// takes a single file per POST and the Neon HTTP driver has no transactions).
export function AttachmentUpload({ dealId }: { dealId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const uploadOne = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("dealId", dealId);
      const response = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        return body.error ?? "Upload failed. Please try again.";
      }
      return null;
    } catch {
      return "Upload failed. Check your connection and try again.";
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) {
      return;
    }
    setIsUploading(true);
    setError(null);
    setProgress({ done: 0, total: files.length });

    let succeeded = 0;
    let firstError: string | null = null;
    // Sequential: each file is an independent POST, and uploading them one at a
    // time keeps timeline ordering deterministic and avoids hammering the
    // worker. Already-uploaded files persist even if a later one fails.
    for (const [index, file] of files.entries()) {
      const message = await uploadOne(file);
      if (message) {
        firstError ??= message;
      } else {
        succeeded += 1;
      }
      setProgress({ done: index + 1, total: files.length });
    }

    if (succeeded > 0) {
      router.refresh();
    }

    if (firstError) {
      const summary =
        succeeded > 0
          ? `${succeeded} added, ${files.length - succeeded} failed`
          : firstError;
      setError(summary);
      toast.error(summary);
    } else if (files.length === 1) {
      const [file] = files;
      toast.success(
        file.type.startsWith("image/") ? "Photo added" : "File added"
      );
    } else {
      toast.success(`${succeeded} files added`);
    }

    setIsUploading(false);
    setProgress({ done: 0, total: 0 });
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  let buttonLabel = "Add photo or file";
  if (isUploading) {
    buttonLabel =
      progress.total > 1
        ? `Uploading ${progress.done + 1} of ${progress.total}…`
        : "Uploading…";
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        aria-label="Attachment file"
        className="sr-only"
        id="attachment-file"
        multiple
        onChange={(event) => handleFiles(event.target.files)}
        ref={inputRef}
        type="file"
      />
      <Button
        className="h-12 gap-2"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        type="button"
        variant="secondary"
      >
        <Camera aria-hidden className="size-5" />
        {buttonLabel}
      </Button>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
