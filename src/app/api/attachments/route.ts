import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { activity, attachment, deal } from "@/db/schema";
import {
  enrichAttachmentsByIds,
  getAttachmentDescriptionMode,
} from "@/lib/ai/attachment-describe";
import { getSessionUserId } from "@/lib/session";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  sanitizeFileName,
} from "@/lib/validation/attachment";

// Upload a file or photo onto a deal (FR-9). Objects go to the private R2
// bucket (PHOTO_BUCKET binding; simulated locally by the OpenNext dev
// integration) and are served back through /api/attachments/[id], so they
// are never publicly listable.

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const file = formData.get("file");
  const dealId = formData.get("dealId");

  if (!(file instanceof File) || typeof dealId !== "string" || dealId === "") {
    return NextResponse.json(
      { error: "A file and dealId are required" },
      { status: 400 }
    );
  }
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: "Files must be between 1 byte and 10 MB" },
      { status: 400 }
    );
  }
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Photos, PDFs, and Office documents only" },
      { status: 400 }
    );
  }

  const [target] = await db
    .select({ id: deal.id })
    .from(deal)
    .where(eq(deal.id, dealId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Unknown deal" }, { status: 404 });
  }

  const fileName = sanitizeFileName(file.name);
  const fileKey = `deals/${dealId}/${crypto.randomUUID()}/${fileName}`;

  const { ctx, env } = getCloudflareContext();
  await env.PHOTO_BUCKET.put(fileKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const [created] = await db
    .insert(attachment)
    .values({
      dealId,
      fileKey,
      fileName,
      contentType: file.type,
      sizeBytes: file.size,
      uploadedBy: userId,
    })
    .returning({ id: attachment.id });

  if (!created) {
    return NextResponse.json(
      { error: "Failed to record the attachment" },
      { status: 500 }
    );
  }

  await db.insert(activity).values({
    dealId,
    type: "note",
    content: `Attached ${fileName}`,
    createdBy: userId,
  });

  // Eager mode: enrich the file now (describe + index for search) so the
  // assistant has it immediately. Lazy mode (default) leaves it for the first
  // view_deal_file call. The work is detached via waitUntil so the upload
  // response is not held up.
  if ((await getAttachmentDescriptionMode()) === "eager") {
    const attachmentId = created.id;
    ctx.waitUntil(enrichAttachmentsByIds([attachmentId]));
  }

  revalidatePath(`/deals/${dealId}`);
  return NextResponse.json({ id: created.id }, { status: 201 });
}
