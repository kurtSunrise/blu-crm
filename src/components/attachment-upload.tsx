"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Mobile-first upload (FR-10): one large target that opens the camera or
// file picker; posts straight to the attachments endpoint.
export function AttachmentUpload({ dealId }: { dealId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      return;
    }
    setIsUploading(true);
    setError(null);
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
        setError(body.error ?? "Upload failed. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
        aria-label="Attachment file"
        className="sr-only"
        id="attachment-file"
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
        {isUploading ? "Uploading…" : "Add photo or file"}
      </Button>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
