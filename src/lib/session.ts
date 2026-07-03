import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { session as sessionTable } from "@/db/schema";
import { baseUrlFromHeaders, getAuth } from "@/lib/auth";

export const getSession = async () => {
  // Temporary sign-in hang diagnosis: timing marks around each await so the
  // wrangler tail shows exactly where a hanging render stops progressing.
  const startedAt = Date.now();
  console.log("[auth-debug] getSession start");
  const requestHeaders = await headers();
  console.log(`[auth-debug] headers ok +${Date.now() - startedAt}ms`);
  const auth = getAuth(baseUrlFromHeaders(requestHeaders));
  console.log(`[auth-debug] instance ok +${Date.now() - startedAt}ms`);
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });
  console.log(
    `[auth-debug] api.getSession ok +${Date.now() - startedAt}ms session=${session ? "yes" : "null"}`
  );

  // Defense in depth: if a session was issued before the user was disabled (or
  // disabled mid-session), revoke every session they hold and treat them as
  // signed out. The sign-in hook in auth.ts blocks new sessions; this closes
  // the window on already-live ones.
  if (session?.user.disabled) {
    await db
      .delete(sessionTable)
      .where(eq(sessionTable.userId, session.user.id));
    return null;
  }

  return session;
};

// For pages inside the app shell: bounce to sign-in when unauthenticated.
export const requireSession = async () => {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  return session;
};

// For admin-only surfaces (e.g. manage team members): require a session and an
// admin role, otherwise bounce home. Returns the session for the admin.
export const requireAdmin = async () => {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/");
  }
  return session;
};

// For mutations: attribute created_by/updated_by where a session exists
// (public intake paths legitimately have none).
export const getSessionUserId = async (): Promise<string | null> => {
  const session = await getSession();
  return session?.user.id ?? null;
};
