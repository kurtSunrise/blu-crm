"use client";

import { Check, Link as LinkIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const COPIED_RESET_MS = 2000;

// Copies the absolute URL for an in-app path so the team can paste the
// public enquiry form into emails, socials, or the website.
export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the
      // Open link beside this button still reaches the page.
    }
  };

  return (
    <Button
      className="h-11 gap-2 px-4"
      onClick={handleCopy}
      type="button"
      variant="outline"
    >
      {copied ? (
        <Check aria-hidden className="size-4" />
      ) : (
        <LinkIcon aria-hidden className="size-4" />
      )}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}
