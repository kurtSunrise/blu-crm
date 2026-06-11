import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgentTurn } from "@/lib/ai/agent-loop";
import { createAnthropicClient, isAiConfigured } from "@/lib/ai/client";
import { buildPageContext } from "@/lib/ai/page-context";
import {
  encodeStreamPayload,
  type StreamPayload,
} from "@/lib/ai/stream-protocol";
import {
  appendThreadMessage,
  createThread,
  getThreadForUser,
  loadThreadMessages,
} from "@/lib/ai/threads";
import { auth } from "@/lib/auth";

const TITLE_MAX_LENGTH = 60;

const chatRequestSchema = z.object({
  message: z.string().min(1),
  pageContext: z.object({
    contactId: z.string().optional(),
    dealId: z.string().optional(),
    pathname: z.string(),
  }),
  threadId: z.string().optional(),
});

const deriveTitle = (message: string): string => {
  const collapsed = message.replaceAll(/\s+/g, " ").trim();
  return collapsed.length > TITLE_MAX_LENGTH
    ? `${collapsed.slice(0, TITLE_MAX_LENGTH - 1)}…`
    : collapsed;
};

// The AI assistant chat endpoint (M4 / FR-7). Streams NDJSON payloads; the
// thread, messages, and tool outcomes are persisted server-side so the
// conversation can resume across reloads.
export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in to use the assistant" }, {
      status: 401,
    });
  }

  // Graceful degradation: the rest of the CRM works without the assistant.
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "The AI assistant is not configured on this environment" },
      { status: 503 }
    );
  }

  let parsedBody: z.infer<typeof chatRequestSchema>;
  try {
    parsedBody = chatRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = session.user.id;
  const thread = parsedBody.threadId
    ? await getThreadForUser(parsedBody.threadId, userId)
    : await createThread(
        userId,
        {
          contactId: parsedBody.pageContext.contactId,
          dealId: parsedBody.pageContext.dealId,
          originPage: parsedBody.pageContext.pathname,
        },
        deriveTitle(parsedBody.message)
      );
  if (!thread) {
    return NextResponse.json({ error: "Unknown thread" }, { status: 404 });
  }

  // Volatile context (date, page, entity headers) rides in the user turn so
  // the cached system prefix stays byte-stable.
  const pageContext = await buildPageContext(
    parsedBody.pageContext,
    session.user.name
  );
  const userContent: Anthropic.ContentBlockParam[] = [
    { text: pageContext, type: "text" },
    { text: parsedBody.message, type: "text" },
  ];
  await appendThreadMessage(thread.id, "user", userContent);
  const messages = await loadThreadMessages(thread.id);

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (payload: StreamPayload): void => {
    writer.write(encoder.encode(encodeStreamPayload(payload))).catch(() => {
      // Client went away mid-stream; the turn still completes server-side.
    });
  };

  const run = async (): Promise<void> => {
    try {
      send({ threadId: thread.id, type: "thread" });
      await runAgentTurn({
        client: createAnthropicClient(),
        ctx: { threadId: thread.id, userId },
        messages,
        send,
      });
      send({ messageId: null, type: "done" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The assistant hit an unexpected error";
      send({ message, retryable: true, type: "error" });
    } finally {
      await writer.close().catch(() => {
        // Stream already closed by a disconnecting client.
      });
    }
  };
  void run();

  return new Response(readable, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  });
}
