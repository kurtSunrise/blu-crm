import { NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/ai/assistant-user";
import { getThreadForUser, loadThreadDisplayMessages } from "@/lib/ai/threads";

// The readable transcript of one thread, for resuming it in the panel
// (M4 Phase 4). Ownership is enforced the same way /api/chat does it.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const assistantUser = await resolveAssistantUser(request);
  if (!assistantUser) {
    return NextResponse.json(
      { error: "Sign in to use the assistant" },
      { status: 401 }
    );
  }

  const { id } = await params;
  const thread = await getThreadForUser(id, assistantUser.id);
  if (!thread) {
    return NextResponse.json({ error: "Unknown thread" }, { status: 404 });
  }

  const messages = await loadThreadDisplayMessages(thread.id);
  return NextResponse.json({
    messages,
    thread: { id: thread.id, status: thread.status, title: thread.title },
  });
}
