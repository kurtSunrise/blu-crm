import { NextResponse } from "next/server";
import { resolveAssistantUser } from "@/lib/ai/assistant-user";
import { listThreadsForUser } from "@/lib/ai/threads";

// Recent assistant conversations for the panel's history view (M4 Phase 4).
// Listing works even when the model is unconfigured; resuming an old thread
// to read it back is still useful offline.
export async function GET(request: Request): Promise<Response> {
  const assistantUser = await resolveAssistantUser(request);
  if (!assistantUser) {
    return NextResponse.json(
      { error: "No team members exist yet; seed a user first" },
      { status: 401 }
    );
  }
  const threads = await listThreadsForUser(assistantUser.id);
  return NextResponse.json({ threads });
}
