"use client";

import { useEffect } from "react";
import { useAiAssistant } from "@/components/ai/ai-context";

// Rendered by deal and contact detail pages (server components) to tell the
// assistant which record is on screen. The runtime adapter already forwards
// the ids to /api/chat as pageContext, and the composer shows the label as a
// context chip so the user can see what the assistant is drawing on.
export function AiEntityBeacon({
  contactId,
  dealId,
  label,
}: {
  contactId?: string;
  dealId?: string;
  label: string;
}) {
  const { clearEntity, registerEntity } = useAiAssistant();

  useEffect(() => {
    registerEntity({ contactId, dealId, label });
    return () => clearEntity();
  }, [registerEntity, clearEntity, contactId, dealId, label]);

  return null;
}
