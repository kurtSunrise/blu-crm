"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

// Shared assistant state (Billify's *-context pattern): panel visibility,
// the active persisted thread, the on-screen entity registered by detail
// pages, and the offline flag set when /api/chat reports 503.

export interface AiEntityRef {
  contactId?: string;
  dealId?: string;
  label?: string;
}

interface AiAssistantContextValue {
  clearEntity: () => void;
  entity: AiEntityRef | null;
  offline: boolean;
  open: boolean;
  registerEntity: (entity: AiEntityRef) => void;
  setOffline: (offline: boolean) => void;
  setOpen: (open: boolean) => void;
  setThreadId: (threadId: string | null) => void;
  threadId: string | null;
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [entity, setEntity] = useState<AiEntityRef | null>(null);

  const registerEntity = useCallback((next: AiEntityRef) => {
    setEntity(next);
  }, []);
  const clearEntity = useCallback(() => {
    setEntity(null);
  }, []);

  const value = useMemo(
    () => ({
      clearEntity,
      entity,
      offline,
      open,
      registerEntity,
      setOffline,
      setOpen,
      setThreadId,
      threadId,
    }),
    [clearEntity, entity, offline, open, registerEntity, threadId]
  );

  return (
    <AiAssistantContext.Provider value={value}>
      {children}
    </AiAssistantContext.Provider>
  );
}

export const useAiAssistant = (): AiAssistantContextValue => {
  const context = useContext(AiAssistantContext);
  if (!context) {
    throw new Error("useAiAssistant must be used inside AiAssistantProvider");
  }
  return context;
};
