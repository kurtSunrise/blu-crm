"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appSetting, dealSubStatus } from "@/db/schema";
import type { SettingsActionState } from "@/lib/actions/settings-actions";
import { requireAdmin } from "@/lib/session";
import {
  SUB_STATUS_SHOW_BOARD_KEY,
  SUB_STATUS_SHOW_DEAL_KEY,
} from "@/lib/sub-statuses";
import {
  reorderSubStatusesSchema,
  subStatusPlacementSchema,
  subStatusUpsertSchema,
} from "@/lib/validation/settings";

// Surfaces that show a status badge or picker; bust their caches after a change.
const revalidateStatusSurfaces = (): void => {
  revalidatePath("/settings/statuses");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  revalidatePath("/deals/[id]", "page");
};

export const createSubStatus = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  await requireAdmin();

  const parsed = subStatusUpsertSchema.safeParse({
    label: formData.get("label"),
    color: formData.get("color"),
  });
  if (!parsed.success) {
    return { error: "Enter a label and pick a colour" };
  }

  const [{ maxPosition }] = await db
    .select({
      maxPosition: sql<number>`coalesce(max(${dealSubStatus.position}), -1)`,
    })
    .from(dealSubStatus);

  await db.insert(dealSubStatus).values({
    label: parsed.data.label,
    color: parsed.data.color,
    position: maxPosition + 1,
  });

  revalidateStatusSurfaces();
  return { saved: true };
};

export const updateSubStatus = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { error: "Missing status to update" };
  }

  const parsed = subStatusUpsertSchema.safeParse({
    id,
    label: formData.get("label"),
    color: formData.get("color"),
  });
  if (!parsed.success) {
    return { error: "Enter a label and pick a colour" };
  }

  await db
    .update(dealSubStatus)
    .set({
      label: parsed.data.label,
      color: parsed.data.color,
      updatedAt: new Date(),
    })
    .where(eq(dealSubStatus.id, id));

  revalidateStatusSurfaces();
  return { saved: true };
};

export const archiveSubStatus = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { error: "Missing status to archive" };
  }

  await db
    .update(dealSubStatus)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(dealSubStatus.id, id));

  revalidateStatusSurfaces();
  return { saved: true };
};

export const restoreSubStatus = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { error: "Missing status to restore" };
  }

  await db
    .update(dealSubStatus)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(dealSubStatus.id, id));

  revalidateStatusSurfaces();
  return { saved: true };
};

export const reorderSubStatuses = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  await requireAdmin();

  const raw = formData.get("orderedIds");
  if (typeof raw !== "string") {
    return { error: "Could not read the new order" };
  }

  let orderedIds: unknown;
  try {
    orderedIds = JSON.parse(raw);
  } catch {
    return { error: "Could not read the new order" };
  }

  const parsed = reorderSubStatusesSchema.safeParse({ orderedIds });
  if (!parsed.success) {
    return { error: "Could not read the new order" };
  }

  const now = new Date();
  let position = 0;
  for (const id of parsed.data.orderedIds) {
    await db
      .update(dealSubStatus)
      .set({ position, updatedAt: now })
      .where(eq(dealSubStatus.id, id));
    position += 1;
  }

  revalidateStatusSurfaces();
  return { saved: true };
};

export const updateSubStatusPlacement = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  await requireAdmin();

  const parsed = subStatusPlacementSchema.safeParse({
    showOnBoard: formData.get("showOnBoard") === "on",
    showOnDealPage: formData.get("showOnDealPage") === "on",
  });
  if (!parsed.success) {
    return { error: "Could not save where the status control appears" };
  }

  const entries = [
    { key: SUB_STATUS_SHOW_BOARD_KEY, value: String(parsed.data.showOnBoard) },
    {
      key: SUB_STATUS_SHOW_DEAL_KEY,
      value: String(parsed.data.showOnDealPage),
    },
  ];

  for (const entry of entries) {
    await db
      .insert(appSetting)
      .values({ ...entry, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSetting.key,
        set: { value: entry.value, updatedAt: new Date() },
      });
  }

  revalidatePath("/settings/statuses");
  revalidatePath("/pipeline");
  revalidatePath("/deals/[id]", "page");
  return { saved: true };
};
