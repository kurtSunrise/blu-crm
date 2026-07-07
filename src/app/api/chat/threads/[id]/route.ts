import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAssistantUser } from "@/lib/ai/assistant-user";
import { listThreadFeedback } from "@/lib/ai/feedback";
import {
  archiveThread,
  getThreadForUser,
  loadThreadDisplayMessages,
  parsePendingPlan,
  type ThreadRecord,
  updateThreadSettings,
} from "@/lib/ai/threads";

// One thread's transcript plus management (rename, pin, soft delete).
// Ownership is enforced the same way /api/chat does it: session user plus
// getThreadForUser on every method.

interface RouteParams {
  params: Promise<{ id: string }>;
}

const resolveThread = async (
  request: Request,
  params: RouteParams["params"]
): Promise<{ response: Response } | { thread: ThreadRecord }> => {
  const assistantUser = await resolveAssistantUser(request);
  if (!assistantUser) {
    return {
      response: NextResponse.json(
        { error: "Sign in to use the assistant" },
        { status: 401 }
      ),
    };
  }
  const { id } = await params;
  const thread = await getThreadForUser(id, assistantUser.id);
  if (!thread) {
    return {
      response: NextResponse.json({ error: "Unknown thread" }, { status: 404 }),
    };
  }
  return { thread };
};

// The readable transcript for resuming a thread in the panel (M4 Phase 4):
// messages with their rebuilt artifact/confirmation parts, and the live
// pending plan items when the thread awaits a confirmation.
export async function GET(
  request: Request,
  { params }: RouteParams
): Promise<Response> {
  const resolved = await resolveThread(request, params);
  if ("response" in resolved) {
    return resolved.response;
  }
  const { thread } = resolved;

  const pendingPlan =
    thread.status === "awaiting_confirmation"
      ? parsePendingPlan(thread.pendingToolUse)
      : null;
  // Independent reads fan out together (no sequential Neon awaits): the
  // transcript and the user's own thumbs ratings for it.
  const [messages, feedback] = await Promise.all([
    loadThreadDisplayMessages(thread.id, pendingPlan),
    listThreadFeedback(thread.userId, thread.id),
  ]);
  return NextResponse.json({
    feedback,
    messages,
    thread: {
      id: thread.id,
      status: thread.status,
      title: thread.title,
      ...(pendingPlan ? { pendingToolUses: pendingPlan.items } : {}),
    },
  });
}

const TITLE_MAX = 80;

const patchSchema = z
  .object({
    pinned: z.boolean().optional(),
    title: z.string().min(1).max(TITLE_MAX).optional(),
  })
  .refine((value) => value.pinned !== undefined || value.title !== undefined, {
    message: "Provide a title or a pinned flag",
  });

// Rename and pin/unpin from the history view.
export async function PATCH(
  request: Request,
  { params }: RouteParams
): Promise<Response> {
  const resolved = await resolveThread(request, params);
  if ("response" in resolved) {
    return resolved.response;
  }

  let updates: z.infer<typeof patchSchema>;
  try {
    updates = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await updateThreadSettings(resolved.thread.id, updates);
  return NextResponse.json({ ok: true });
}

// Soft delete: the thread is archived (drops out of history) but keeps its
// messages and audit trail.
export async function DELETE(
  request: Request,
  { params }: RouteParams
): Promise<Response> {
  const resolved = await resolveThread(request, params);
  if ("response" in resolved) {
    return resolved.response;
  }

  await archiveThread(resolved.thread.id);
  return new Response(null, { status: 204 });
}
