import { NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/ai/assistant-user";
import { upsertMessageFeedback } from "@/lib/ai/feedback";
import { chatFeedbackSchema } from "@/lib/validation/chat-feedback";

// Thumbs feedback on an assistant message (Assistant v3 Phase 1). Session
// and ownership are enforced the same way the other chat routes do it:
// resolveAssistantUser for the session, then the write itself verifies the
// message belongs to one of the user's threads (404 otherwise).

export async function POST(request: Request): Promise<NextResponse> {
  const assistantUser = await resolveAssistantUser(request);
  if (!assistantUser) {
    return NextResponse.json(
      { error: "Sign in to use the assistant" },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = chatFeedbackSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid feedback" },
      { status: 400 }
    );
  }

  // Infra failures (Neon hiccups) return a typed { error } instead of an
  // unhandled server error, matching the repo's route conventions.
  let result: Awaited<ReturnType<typeof upsertMessageFeedback>>;
  try {
    result = await upsertMessageFeedback({
      ...parsed.data,
      userId: assistantUser.id,
    });
  } catch (error) {
    console.error("[chat-feedback] write-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Something went wrong. Try again." },
      { status: 500 }
    );
  }

  if (result === "not_found") {
    return NextResponse.json({ error: "Unknown message" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
