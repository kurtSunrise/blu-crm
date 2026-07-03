import { and, count, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { notification } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";

// Lightweight endpoint for the bell badge; polled by the client, so it must
// stay a single indexed count query and never be cached.

export async function GET(): Promise<NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({ unread: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));

  return NextResponse.json(
    { count: row?.unread ?? 0 },
    { headers: { "cache-control": "no-store" } }
  );
}
