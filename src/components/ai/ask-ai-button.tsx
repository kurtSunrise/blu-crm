"use client";

import { SparklesIcon } from "lucide-react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { Button } from "@/components/ui/button";

// Entry point for detail pages: opens the assistant dock with a prepared
// prompt in the composer. The prompt is never auto-sent; the user reviews
// and hits send themselves.
export function AskAiButton({
  label = "Ask AI",
  prompt,
}: {
  label?: string;
  prompt: string;
}) {
  const { openWithPrompt } = useAiAssistant();
  return (
    <Button
      className="min-h-11"
      onClick={() => openWithPrompt(prompt)}
      type="button"
      variant="outline"
    >
      <SparklesIcon aria-hidden className="size-4 text-blu" />
      {label}
    </Button>
  );
}
