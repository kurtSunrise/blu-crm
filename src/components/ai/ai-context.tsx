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
import type { ConfirmationItem } from "@/lib/ai/stream-protocol";

// Shared assistant state (Billify's *-context pattern): panel visibility,
// the active persisted thread, the on-screen entity registered by detail
// pages, the offline flag set when /api/chat reports 503, and the pending
// write-confirmation handshake (FR-7.8).

export interface AiEntityRef {
  contactId?: string;
  dealId?: string;
  label?: string;
}

// A request from outside the dock (notification cards) to open a specific
// persisted thread. The nonce makes re-tapping the same notification
// re-trigger the dock's effect even when the threadId is unchanged.
export interface AssistantThreadRequest {
  nonce: number;
  threadId: string;
}

// The write plan currently awaiting review: one or more gated tool calls in
// proposal order. A single-item plan is the common case.
export interface PendingConfirmation {
  items: ConfirmationItem[];
}

// One reviewed item of the plan; skipped items travel as approved: false.
export interface ConfirmationDecisionItem {
  approved: boolean;
  finalInput?: unknown;
  toolUseId: string;
}

// Set by the confirmation card; picked up by the runtime adapter, which
// sends it to /api/chat as a confirmation instead of a chat message.
export interface ConfirmationDecision {
  decisions: ConfirmationDecisionItem[];
}

// One @-mention picked in the composer. The token is the literal text the
// pick inserted; the runtime adapter only sends the id if that token still
// appears in the message when it is sent, so deleting the token drops the id.
export interface ComposerMention {
  id: string;
  kind: "deal" | "contact";
  token: string;
}

interface AiAssistantContextValue {
  // Registers a transcribed voice note's uploaded audio so the next send
  // carries it as an attachment (the "Voice note attached" chip).
  addVoiceAttachment: (attachmentId: string) => void;
  // The last composer attachment upload/validation failure, shown beneath the
  // input. assistant-ui owns the staged attachments themselves; this is the
  // one piece of attachment state it cannot surface, since the runtime adapter
  // does not await add().
  attachmentError: string | null;
  clearComposerPrefill: () => void;
  clearEntity: () => void;
  // Called by the dock once it has picked up a thread-open request.
  clearRequestedThread: () => void;
  // Called by the runtime adapter once a send has consumed the voice notes.
  clearVoiceAttachments: () => void;
  // Text staged by an "Ask AI" entry point; the composer consumes it into the
  // input (never auto-sent) and then clears it.
  composerPrefill: string | null;
  // A ref, not state: the card writes the decision and appends the
  // "Approve"/"Cancel" bubble in the same tick, and the adapter must see it
  // when that run starts. A state setter only lands after a re-render, so
  // the run would race it and send a plain message (denying the pending
  // write as superseded).
  decisionRef: MutableRefObject<ConfirmationDecision | null>;
  entity: AiEntityRef | null;
  // A ref for the same reason as decisionRef: the mention picker records a
  // pick and the adapter reads the list synchronously when the send runs.
  mentionsRef: MutableRefObject<ComposerMention[]>;
  offline: boolean;
  open: boolean;
  // Opens the dock and asks it to resume the given persisted thread through
  // the same path as picking it from history.
  openAssistantOnThread: (threadId: string) => void;
  // Opens the dock with the composer prefilled (never auto-sent).
  openAssistantWithPrompt: (prompt: string) => void;
  // Legacy alias for openAssistantWithPrompt, kept for the existing Ask AI
  // buttons.
  openWithPrompt: (prompt: string) => void;
  pendingConfirmation: PendingConfirmation | null;
  registerEntity: (entity: AiEntityRef) => void;
  removeVoiceAttachment: (attachmentId: string) => void;
  requestedThread: AssistantThreadRequest | null;
  setAttachmentError: (message: string | null) => void;
  setOffline: (offline: boolean) => void;
  setOpen: (open: boolean) => void;
  setPendingConfirmation: (pending: PendingConfirmation | null) => void;
  setThreadId: (threadId: string | null) => void;
  threadId: string | null;
  // Uploaded audio attachment ids from voice notes awaiting the next send.
  voiceAttachmentIds: string[];
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
  const [composerPrefill, setComposerPrefill] = useState<string | null>(null);
  const [voiceAttachmentIds, setVoiceAttachmentIds] = useState<string[]>([]);
  const [requestedThread, setRequestedThread] =
    useState<AssistantThreadRequest | null>(null);
  const decisionRef = useRef<ConfirmationDecision | null>(null);
  const mentionsRef = useRef<ComposerMention[]>([]);
  const threadRequestNonceRef = useRef(0);

  const registerEntity = useCallback((next: AiEntityRef) => {
    setEntity(next);
  }, []);
  const clearEntity = useCallback(() => {
    setEntity(null);
  }, []);
  const openAssistantWithPrompt = useCallback((prompt: string) => {
    setComposerPrefill(prompt);
    setOpen(true);
  }, []);
  const clearComposerPrefill = useCallback(() => {
    setComposerPrefill(null);
  }, []);
  const addVoiceAttachment = useCallback((attachmentId: string) => {
    setVoiceAttachmentIds((ids) =>
      ids.includes(attachmentId) ? ids : [...ids, attachmentId]
    );
  }, []);
  const removeVoiceAttachment = useCallback((attachmentId: string) => {
    setVoiceAttachmentIds((ids) => ids.filter((id) => id !== attachmentId));
  }, []);
  const clearVoiceAttachments = useCallback(() => {
    setVoiceAttachmentIds([]);
  }, []);
  const openAssistantOnThread = useCallback((nextThreadId: string) => {
    threadRequestNonceRef.current += 1;
    setRequestedThread({
      nonce: threadRequestNonceRef.current,
      threadId: nextThreadId,
    });
    setOpen(true);
  }, []);
  const clearRequestedThread = useCallback(() => {
    setRequestedThread(null);
  }, []);

  const value = useMemo(
    () => ({
      addVoiceAttachment,
      attachmentError,
      clearComposerPrefill,
      clearEntity,
      clearRequestedThread,
      clearVoiceAttachments,
      composerPrefill,
      decisionRef,
      entity,
      mentionsRef,
      offline,
      open,
      openAssistantOnThread,
      openAssistantWithPrompt,
      openWithPrompt: openAssistantWithPrompt,
      pendingConfirmation,
      registerEntity,
      removeVoiceAttachment,
      requestedThread,
      setAttachmentError,
      setOffline,
      setOpen,
      setPendingConfirmation,
      setThreadId,
      threadId,
      voiceAttachmentIds,
    }),
    [
      addVoiceAttachment,
      attachmentError,
      clearComposerPrefill,
      clearEntity,
      clearRequestedThread,
      clearVoiceAttachments,
      composerPrefill,
      entity,
      offline,
      open,
      openAssistantOnThread,
      openAssistantWithPrompt,
      pendingConfirmation,
      registerEntity,
      removeVoiceAttachment,
      requestedThread,
      threadId,
      voiceAttachmentIds,
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
