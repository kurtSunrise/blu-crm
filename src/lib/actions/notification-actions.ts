"use server";

import { isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { notification } from "@/db/schema";

export const markAllNotificationsRead = async (): Promise<void> => {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(isNull(notification.readAt));

  revalidatePath("/notifications");
};
