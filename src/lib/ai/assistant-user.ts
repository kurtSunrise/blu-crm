import { auth } from "@/lib/auth";

// Auth shipped with M0's email/password sign-in, so the assistant requires
// a real session: /api/chat and the thread routes return 401 without one.
// (Public surfaces like the enquiry form never touch these routes.)
export const resolveAssistantUser = async (
  request: Request
): Promise<{ id: string; name: string } | null> => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return null;
  }
  return { id: session.user.id, name: session.user.name };
};
