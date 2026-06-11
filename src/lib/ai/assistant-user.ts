import { asc } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";

// Route gating is not wired yet (M0 SSO pending the Entra registration), so
// like every other surface the assistant falls back to the first seeded team
// member when there is no session. Tighten to a hard 401 when auth ships.
export const resolveAssistantUser = async (
  request: Request
): Promise<{ id: string; name: string } | null> => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) {
    return { id: session.user.id, name: session.user.name };
  }
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .orderBy(asc(user.createdAt))
    .limit(1);
  return rows[0] ?? null;
};
