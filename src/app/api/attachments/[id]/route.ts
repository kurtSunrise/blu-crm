import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { activity, attachment } from "@/db/schema";
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

// Permanently remove an attachment: delete the stored object and the row, and
// note it on the deal timeline (FR-9). Unlike deals, attachments have no soft
// delete; removing one frees the user to re-upload through the right place.
export async function DELETE(
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
      dealId: attachment.dealId,
      fileKey: attachment.fileKey,
      fileName: attachment.fileName,
    })
    .from(attachment)
    .where(eq(attachment.id, id))
    .limit(1);

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete the object first. R2 delete is idempotent, so an orphaned row whose
  // object lives in another bucket (e.g. uploaded via a different deployment)
  // still clears without error.
  const { env } = getCloudflareContext();
  await env.PHOTO_BUCKET.delete(record.fileKey);

  await db.delete(attachment).where(eq(attachment.id, id));

  await db.insert(activity).values({
    dealId: record.dealId,
    type: "note",
    content: `Removed ${record.fileName}`,
    createdBy: userId,
  });

  return NextResponse.json({ ok: true });
}
