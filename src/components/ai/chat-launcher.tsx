"use client";

import { SparklesIcon, XIcon } from "lucide-react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { AiRuntimeProvider } from "@/components/ai/ai-runtime-provider";
import { ChatPanel } from "@/components/ai/chat-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Launcher button used in the desktop sidebar and the mobile header.
export function AiLauncherButton({ withLabel }: { withLabel?: boolean }) {
  const { open, setOpen } = useAiAssistant();

  if (withLabel) {
    return (
      <button
        aria-expanded={open}
        className={cn(
          "flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm transition-colors",
          open
            ? "bg-accent font-medium text-blu"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
        onClick={() => setOpen(!open)}
        type="button"
      >
        <SparklesIcon aria-hidden className="size-4.5" />
        Assistant
      </button>
    );
  }

  return (
    <button
      aria-expanded={open}
      aria-label="Blu assistant"
      className={cn(
        "flex min-h-11 min-w-11 items-center justify-center rounded-md",
        open ? "text-blu" : "text-muted-foreground hover:text-foreground"
      )}
      onClick={() => setOpen(!open)}
      type="button"
    >
      <SparklesIcon aria-hidden className="size-5" />
    </button>
  );
}

// The assistant surface itself. Stays mounted while closed (hidden via CSS)
// so the conversation survives open/close. Mobile: full-screen overlay.
// Desktop: fixed 400px right sidebar; AppShell pads the main content.
export function AiAssistantDock() {
  const { open, setOpen } = useAiAssistant();

  return (
    <aside
      aria-label="Blu assistant"
      className={cn(
        "fixed inset-0 z-50 flex-col bg-background md:left-auto md:z-30 md:w-[400px] md:border-l",
        open ? "flex" : "hidden"
      )}
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b pr-2 pl-4">
        <div className="flex items-center gap-2">
          <SparklesIcon aria-hidden className="size-4 text-blu" />
          <h2 className="font-heading font-semibold text-sm">Blu assistant</h2>
        </div>
        <Button
          aria-label="Close assistant"
          onClick={() => setOpen(false)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden className="size-5" />
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <AiRuntimeProvider>
          <ChatPanel />
        </AiRuntimeProvider>
      </div>
    </aside>
  );
}
