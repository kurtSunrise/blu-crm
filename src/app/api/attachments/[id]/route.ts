import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { attachment } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";

// Streams a stored attachment (FR-9). Files stay private in R2 and are
// only reachable through this signed-in app route.

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
      fileKey: attachment.fileKey,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
    })
    .from(attachment)
    .where(eq(attachment.id, id))
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
      "Content-Type":
        record.contentType ??
        object.httpMetadata?.contentType ??
        "application/octet-stream",
      "Content-Disposition": `inline; filename="${record.fileName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
