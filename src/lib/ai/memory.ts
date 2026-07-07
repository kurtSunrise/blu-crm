import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { assistantMemory } from "@/db/schema";
import { toIsoOrNull } from "@/lib/format";
import { MEMORY_CONTENT_MAX as CONTENT_MAX } from "@/lib/validation/memory";

// Cross-thread assistant memory (Assistant v3 Phase 3). Memories are saved
// automatically by the save_memory tool (no per-memory confirmation, Kurt's
// call), reviewed in Settings, and injected into every conversation via
// buildMemoryBlock. Scope: user_id NULL = org-wide, otherwise personal.
//
// Ownership choice (documented per the phase brief): any signed-in user may
// disable their own memories AND org-wide memories. Org-wide undo by anyone
// is acceptable in a three-person, single-org team; rows are soft-disabled
// so an admin can always recover the content from the database. Admins do
// not get disable access to other users' personal memories: nothing needs
// it, and personal memories stay personal.

// Canonical value lives in the shared validation layer (zod caps there);
// surfaced here too because callers of saveMemory reach for it alongside
// the other memory constants.
export const MEMORY_CONTENT_MAX = CONTENT_MAX;
export const MEMORY_INJECTION_CAP = 30;
const MEMORY_LIST_LIMIT = 200;

export interface MemoryRow {
  content: string;
  createdAt: Date;
  id: string;
  sourceThreadId: string | null;
  updatedAt: Date;
  userId: string | null;
}

const memoryColumns = {
  content: assistantMemory.content,
  createdAt: assistantMemory.createdAt,
  id: assistantMemory.id,
  sourceThreadId: assistantMemory.sourceThreadId,
  updatedAt: assistantMemory.updatedAt,
  userId: assistantMemory.userId,
};

// Own rows plus org-wide rows, active only.
const visibleTo = (userId: string) =>
  and(
    isNull(assistantMemory.disabledAt),
    or(eq(assistantMemory.userId, userId), isNull(assistantMemory.userId))
  );

const normalizeContent = (content: string): string => {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new Error("Memory content is empty.");
  }
  if (trimmed.length > MEMORY_CONTENT_MAX) {
    throw new Error(
      `Memory content is limited to ${MEMORY_CONTENT_MAX} characters.`
    );
  }
  return trimmed;
};

export const saveMemory = async (params: {
  content: string;
  sourceThreadId?: string;
  userId: string;
}): Promise<{ id: string }> => {
  const [row] = await db
    .insert(assistantMemory)
    .values({
      content: normalizeContent(params.content),
      sourceThreadId: params.sourceThreadId ?? null,
      userId: params.userId,
    })
    .returning({ id: assistantMemory.id });
  return { id: row.id };
};

// Admin-created team-wide memory (user_id NULL), from the Settings UI.
export const createOrgMemory = async (
  content: string
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(assistantMemory)
    .values({ content: normalizeContent(content), userId: null })
    .returning({ id: assistantMemory.id });
  return { id: row.id };
};

// Soft-disable. The scope check lives in the WHERE clause so one statement
// stays atomic: the caller can disable their own rows and org rows, never
// another user's personal rows (see the ownership note above).
export const disableMemory = async (
  memoryId: string,
  userId: string,
  options: { isAdmin: boolean } = { isAdmin: false }
): Promise<"not_found" | "ok"> => {
  // Own rows always; team-wide rows only for admins. Auto-saves are always
  // user-scoped, so the in-chat Undo chip never needs the admin path, and the
  // Settings UI already hides delete on team-wide rows for non-admins; this
  // WHERE makes the server agree with both.
  const scope = options.isAdmin
    ? or(eq(assistantMemory.userId, userId), isNull(assistantMemory.userId))
    : eq(assistantMemory.userId, userId);
  const rows = await db
    .update(assistantMemory)
    .set({ disabledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(assistantMemory.id, memoryId), scope))
    .returning({ id: assistantMemory.id });
  return rows.length > 0 ? "ok" : "not_found";
};

// Rewrites an active memory's content. Ownership is enforced by the calling
// action (owner, or admin for org rows) via findMemory; this helper only
// refuses disabled/missing rows.
export const updateMemory = async (
  memoryId: string,
  content: string
): Promise<"not_found" | "ok"> => {
  const rows = await db
    .update(assistantMemory)
    .set({ content: normalizeContent(content), updatedAt: new Date() })
    .where(
      and(eq(assistantMemory.id, memoryId), isNull(assistantMemory.disabledAt))
    )
    .returning({ id: assistantMemory.id });
  return rows.length > 0 ? "ok" : "not_found";
};

// Single active row, unscoped: for the actions' ownership checks only.
export const findMemory = async (
  memoryId: string
): Promise<MemoryRow | null> => {
  const rows = await db
    .select(memoryColumns)
    .from(assistantMemory)
    .where(
      and(eq(assistantMemory.id, memoryId), isNull(assistantMemory.disabledAt))
    )
    .limit(1);
  return rows[0] ?? null;
};

// The Settings review list: own + org-wide, active only, newest first.
export const listMemories = (userId: string): Promise<MemoryRow[]> =>
  db
    .select(memoryColumns)
    .from(assistantMemory)
    .where(visibleTo(userId))
    .orderBy(desc(assistantMemory.createdAt), desc(assistantMemory.id))
    .limit(MEMORY_LIST_LIMIT);

// One memory row serialised for the client review list (createdAt as an ISO
// string; teamWide derived from userId === null). Shared by both settings
// pages so the shapes cannot drift.
export interface AssistantMemoryItem {
  content: string;
  createdAt: string;
  id: string;
  teamWide: boolean;
}

export const toAssistantMemoryItems = (
  rows: MemoryRow[]
): AssistantMemoryItem[] =>
  rows.map((row) => ({
    content: row.content,
    createdAt: toIsoOrNull(row.createdAt) ?? "",
    id: row.id,
    teamWide: row.userId === null,
  }));

// Deterministic within-scope order (createdAt asc, id tiebreak) so the block
// bytes only change when memories change: the integrator places this near
// the cached prompt prefix and stable bytes keep the cache warm.
const byCreatedAsc = (a: MemoryRow, b: MemoryRow): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

const bulletList = (rows: MemoryRow[]): string =>
  rows.map((row) => `- ${row.content}`).join("\n");

// The injected prompt block: null when the user has no active memories,
// otherwise up to MEMORY_INJECTION_CAP memories. Team-wide rows always win a
// slot ahead of personal ones (org policy must not be crowded out by a
// pile of newer personal memories); recency breaks ties within each scope.
// Memory personalizes the turn but must never take it down: any failure here
// (e.g. the table missing mid-rollout, a transient Neon error) degrades to no
// memory block rather than a dead assistant.
export const buildMemoryBlock = async (
  userId: string
): Promise<string | null> => {
  let rows: MemoryRow[];
  try {
    rows = await db
      .select(memoryColumns)
      .from(assistantMemory)
      .where(visibleTo(userId))
      .orderBy(
        sql`(${assistantMemory.userId} is null) desc`,
        desc(assistantMemory.createdAt),
        desc(assistantMemory.id)
      )
      .limit(MEMORY_INJECTION_CAP);
  } catch (error) {
    console.error("[memory] load-failed, continuing without memories", error);
    return null;
  }
  if (rows.length === 0) {
    return null;
  }

  const orgRows = rows.filter((row) => row.userId === null).sort(byCreatedAsc);
  const userRows = rows.filter((row) => row.userId !== null).sort(byCreatedAsc);

  const sections: string[] = ["# Remembered context"];
  if (orgRows.length > 0) {
    sections.push(`## Team-wide\n${bulletList(orgRows)}`);
  }
  if (userRows.length > 0) {
    sections.push(`## For this user\n${bulletList(userRows)}`);
  }
  return sections.join("\n\n");
};
