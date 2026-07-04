import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { chatAttachment } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";

// Streams a stored chat attachment so the composer can render image
// thumbnails. Files stay private in R2 and are only reachable through this
// signed-in app route.

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { id } = await context.params;

  const [record] = await db
    .select({
      contentType: chatAttachment.contentType,
      fileKey: chatAttachment.fileKey,
      fileName: chatAttachment.fileName,
    })
    .from(chatAttachment)
    // Chat attachments belong to the composer's own thread flow, so unlike
    // deal attachments (org-visible by design) they are scoped to their
    // uploader. Rows predating uploadedBy will 404; they were transient
    // composer thumbnails.
    .where(
      and(eq(chatAttachment.id, id), eq(chatAttachment.uploadedBy, userId))
    )
    .limit(1);

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { env } = getCloudflareContext();
  const object = await env.PHOTO_BUCKET.get(record.fileKey);
  if (!object) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${record.fileName}"`,
      "Content-Type":
        record.contentType ??
        object.httpMetadata?.contentType ??
        "application/octet-stream",
      // Client-supplied MIME is not trusted to execute in the app origin.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
