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

// A file uploaded via /api/chat/attachments, staged in the composer until the
// next message is sent.
export interface UploadedAttachment {
  contentType: string;
  fileName: string;
  id: string;
  sizeBytes: number;
}

interface AiAssistantContextValue {
  // Staged uploads, read and cleared by the adapter when the run starts — a
  // ref for the same reason as decisionRef below. pendingAttachments mirrors
  // it as state so the composer chips re-render.
  attachmentsRef: MutableRefObject<UploadedAttachment[]>;
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
  pendingAttachments: UploadedAttachment[];
  pendingConfirmation: PendingConfirmation | null;
  registerEntity: (entity: AiEntityRef) => void;
  setOffline: (offline: boolean) => void;
  setOpen: (open: boolean) => void;
  setPendingAttachments: (attachments: UploadedAttachment[]) => void;
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
  const [pendingAttachments, setPendingAttachmentsState] = useState<
    UploadedAttachment[]
  >([]);
  const decisionRef = useRef<ConfirmationDecision | null>(null);
  const attachmentsRef = useRef<UploadedAttachment[]>([]);

  // One setter keeps the ref (read by the adapter at run start) and the state
  // (drives the chips) in lockstep.
  const setPendingAttachments = useCallback((next: UploadedAttachment[]) => {
    attachmentsRef.current = next;
    setPendingAttachmentsState(next);
  }, []);

  const registerEntity = useCallback((next: AiEntityRef) => {
    setEntity(next);
  }, []);
  const clearEntity = useCallback(() => {
    setEntity(null);
  }, []);

  const value = useMemo(
    () => ({
      attachmentsRef,
      clearEntity,
      decisionRef,
      entity,
      offline,
      open,
      pendingAttachments,
      pendingConfirmation,
      registerEntity,
      setOffline,
      setOpen,
      setPendingAttachments,
      setPendingConfirmation,
      setThreadId,
      threadId,
    }),
    [
      clearEntity,
      entity,
      offline,
      open,
      pendingAttachments,
      pendingConfirmation,
      registerEntity,
      setPendingAttachments,
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
