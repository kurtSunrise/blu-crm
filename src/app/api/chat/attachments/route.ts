import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { chatAttachment } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";
import {
  AI_READABLE_TYPES,
  MAX_ATTACHMENT_BYTES,
  sanitizeFileName,
} from "@/lib/validation/attachment";

// Upload a file the assistant can read (images, PDFs) into the private R2
// bucket (PHOTO_BUCKET). The returned id travels with the next chat message;
// the model-facing request rehydrates base64 from R2 at send time, so the
// stored message holds only a lightweight reference.

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
  const threadIdField = formData.get("threadId");
  const threadId = typeof threadIdField === "string" ? threadIdField : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: "Files must be between 1 byte and 10 MB" },
      { status: 400 }
    );
  }
  if (!AI_READABLE_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Images (JPG, PNG, WebP) and PDFs only. Convert HEIC first." },
      { status: 400 }
    );
  }

  const fileName = sanitizeFileName(file.name);
  const fileKey = `chat/${threadId ?? "unbound"}/${crypto.randomUUID()}/${fileName}`;

  const { env } = getCloudflareContext();
  await env.PHOTO_BUCKET.put(fileKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const [created] = await db
    .insert(chatAttachment)
    .values({
      contentType: file.type,
      fileKey,
      fileName,
      sizeBytes: file.size,
      threadId,
      uploadedBy: userId,
    })
    .returning({ id: chatAttachment.id });

  if (!created) {
    return NextResponse.json(
      { error: "Failed to record the attachment" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      contentType: file.type,
      fileName,
      id: created.id,
      sizeBytes: file.size,
    },
    { status: 201 }
  );
}
