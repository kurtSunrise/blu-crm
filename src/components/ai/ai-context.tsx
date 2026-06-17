"use client";

import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

// Shared assistant state (Billify's *-context pattern): panel visibility,
// the active persisted thread, the on-screen entity registered by detail
// pages, the offline flag set when /api/chat reports 503, and the pending
// write-confirmation handshake (FR-7.8).

export interface AiEntityRef {
  contactId?: string;
  dealId?: string;
  label?: string;
}

export interface PendingConfirmation {
  input: unknown;
  summary: string;
  toolName: string;
  toolUseId: string;
}

// Set by the confirmation card; picked up by the runtime adapter, which
// sends it to /api/chat as a confirmation instead of a chat message.
export interface ConfirmationDecision {
  approved: boolean;
  finalInput?: unknown;
  toolUseId: string;
}

interface AiAssistantContextValue {
  // The last composer attachment upload/validation failure, shown beneath the
  // input. assistant-ui owns the staged attachments themselves; this is the
  // one piece of attachment state it cannot surface, since the runtime adapter
  // does not await add().
  attachmentError: string | null;
  clearEntity: () => void;
  // A ref, not state: the card writes the decision and appends the
  // "Approve"/"Cancel" bubble in the same tick, and the adapter must see it
  // when that run starts. A state setter only lands after a re-render, so
  // the run would race it and send a plain message (denying the pending
  // write as superseded).
  decisionRef: MutableRefObject<ConfirmationDecision | null>;
  entity: AiEntityRef | null;
  offline: boolean;
  open: boolean;
  pendingConfirmation: PendingConfirmation | null;
  registerEntity: (entity: AiEntityRef) => void;
  setAttachmentError: (message: string | null) => void;
  setOffline: (offline: boolean) => void;
  setOpen: (open: boolean) => void;
  setPendingConfirmation: (pending: PendingConfirmation | null) => void;
  setThreadId: (threadId: string | null) => void;
  threadId: string | null;
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [entity, setEntity] = useState<AiEntityRef | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const decisionRef = useRef<ConfirmationDecision | null>(null);

  const registerEntity = useCallback((next: AiEntityRef) => {
    setEntity(next);
  }, []);
  const clearEntity = useCallback(() => {
    setEntity(null);
  }, []);

  const value = useMemo(
    () => ({
      attachmentError,
      clearEntity,
      decisionRef,
      entity,
      offline,
      open,
      pendingConfirmation,
      registerEntity,
      setAttachmentError,
      setOffline,
      setOpen,
      setPendingConfirmation,
      setThreadId,
      threadId,
    }),
    [
      attachmentError,
      clearEntity,
      entity,
      offline,
      open,
      pendingConfirmation,
      registerEntity,
      threadId,
    ]
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
