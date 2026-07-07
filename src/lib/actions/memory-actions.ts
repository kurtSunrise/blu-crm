"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions/run-action";
import {
  createOrgMemory,
  disableMemory,
  findMemory,
  updateMemory,
} from "@/lib/ai/memory";
import { requireActionAdmin, requireActionSession } from "@/lib/session";
import {
  createOrgMemorySchema,
  disableMemorySchema,
  updateMemorySchema,
} from "@/lib/validation/memory";

// Assistant memory management (Assistant v3 Phase 3). Ownership model,
// documented per the phase brief and kept deliberately simple for a
// three-person single-org team:
// - Disable (the Undo chip and the Settings list): any user may disable
//   their own memories and org-wide memories; personal memories of other
//   users stay untouchable. Enforced inside disableMemory's WHERE clause.
// - Edit: the owner edits their own memories; admins edit org-wide rows.
// - Create org-wide: admins only.

export interface MemoryActionState {
  error?: string;
  message?: string;
}

// The Settings review UI lists memories on both pages (admins on the AI page,
// everyone on their account page); the in-chat Undo chip updates its own
// state client-side, so these revalidations only refresh Settings.
const MEMORY_SURFACES = ["/settings/ai", "/settings/account"] as const;

const revalidateMemorySurfaces = (): void => {
  for (const surface of MEMORY_SURFACES) {
    revalidatePath(surface);
  }
};

export const disableMemoryAction = async (
  input: unknown
): Promise<MemoryActionState> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = disableMemorySchema.safeParse(input);
    if (!parsed.success) {
      return { error: "That memory reference isn't valid." };
    }

    const result = await disableMemory(
      parsed.data.memoryId,
      auth.session.user.id,
      {
        isAdmin: auth.session.user.role === "admin",
      }
    );
    if (result === "not_found") {
      return { error: "That memory no longer exists." };
    }
    revalidateMemorySurfaces();
    return { message: "Memory removed." };
  });

export const updateMemoryAction = async (
  input: unknown
): Promise<MemoryActionState> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = updateMemorySchema.safeParse(input);
    if (!parsed.success) {
      return { error: "Memories must be 8 to 500 characters." };
    }

    const memory = await findMemory(parsed.data.memoryId);
    if (!memory) {
      return { error: "That memory no longer exists." };
    }
    const isAdmin = auth.session.user.role === "admin";
    const canEdit =
      memory.userId === auth.session.user.id ||
      (memory.userId === null && isAdmin);
    if (!canEdit) {
      return { error: "You can't edit that memory." };
    }

    const result = await updateMemory(
      parsed.data.memoryId,
      parsed.data.content
    );
    if (result === "not_found") {
      return { error: "That memory no longer exists." };
    }
    revalidateMemorySurfaces();
    return { message: "Memory updated." };
  });

export const createOrgMemoryAction = async (
  input: unknown
): Promise<MemoryActionState> =>
  runAction(async () => {
    const auth = await requireActionAdmin();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = createOrgMemorySchema.safeParse(input);
    if (!parsed.success) {
      return { error: "Memories must be 8 to 500 characters." };
    }

    await createOrgMemory(parsed.data.content);
    revalidateMemorySurfaces();
    return { message: "Team-wide memory added." };
  });
