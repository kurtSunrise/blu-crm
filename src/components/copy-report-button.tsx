"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const COPIED_RESET_MS = 2000;

// Share path until the AI artifact flow (M4): copy the plain-text report
// into email or WhatsApp.
export function CopyReportButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the
      // on-screen report remains selectable either way.
    }
  };

  return (
    <Button className="h-11 gap-2" onClick={handleCopy} type="button">
      {copied ? (
        <Check aria-hidden className="size-4" />
      ) : (
        <Copy aria-hidden className="size-4" />
      )}
      {copied ? "Copied" : "Copy report"}
    </Button>
  );
}
