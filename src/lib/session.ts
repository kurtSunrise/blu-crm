import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const getSession = async () =>
  await auth.api.getSession({ headers: await headers() });

// For pages inside the app shell: bounce to sign-in when unauthenticated.
export const requireSession = async () => {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  return session;
};

// For mutations: attribute created_by/updated_by where a session exists
// (public intake paths legitimately have none).
export const getSessionUserId = async (): Promise<string | null> => {
  const session = await getSession();
  return session?.user.id ?? null;
};
