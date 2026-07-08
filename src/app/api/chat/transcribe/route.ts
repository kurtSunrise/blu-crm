import { Buffer } from "node:buffer";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { storeChatAttachment } from "@/lib/ai/attachments";
import { getSessionUserId } from "@/lib/session";

// Transcribe a short voice recording from the assistant composer via Workers
// AI Whisper. The client posts multipart form data with an `audio` field and
// receives `{ text, attachmentId }` on success or `{ error }` with
// 400/401/502/503/504. Resolves PRD open question Q3: transcription path =
// Workers AI Whisper. The recording itself is retained as a chat_attachment
// in R2 (PRD FR-7.7) so log_activity can later file it against a deal;
// attachmentId is null when retention fails, because keeping the audio must
// never break dictation.

// Fallback if this model ever rejects a browser container: `@cf/openai/whisper`
// accepts `{ audio: number[] }` as a raw byte array instead of base64.
const TRANSCRIBE_MODEL = "@cf/openai/whisper-large-v3-turbo";

// Composer recordings auto-stop at 60s; 5 MB comfortably covers that in every
// browser container (webm/opus, mp4/AAC) with headroom.
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 30_000;

const isAcceptedAudioType = (contentType: string): boolean => {
  const type = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  // Safari's MediaRecorder labels mp4 audio-only recordings as video/mp4.
  return type.startsWith("audio/") || type === "video/mp4";
};

// A human-scannable file name for the retained recording, stamped in AWST
// (house rule: DD/MM/YYYY dates, AWST times), e.g. voice-note-07072026-1432.
const VOICE_NOTE_STAMP = new Intl.DateTimeFormat("en-AU", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Australia/Perth",
  year: "numeric",
});

const EXTENSION_BY_TYPE: Record<string, string> = {
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "video/mp4": "mp4",
};

const voiceNoteFileName = (contentType: string): string => {
  const type = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  const extension = EXTENSION_BY_TYPE[type] ?? "webm";
  const parts = new Map(
    VOICE_NOTE_STAMP.formatToParts(new Date()).map((part) => [
      part.type,
      part.value,
    ])
  );
  const stamp = `${parts.get("day")}${parts.get("month")}${parts.get("year")}-${parts.get("hour")}${parts.get("minute")}`;
  return `voice-note-${stamp}.${extension}`;
};

// Best-effort retention: R2 or insert failures degrade to attachmentId null
// with the transcription still returned.
const retainVoiceNote = async (params: {
  bytes: ArrayBuffer;
  contentType: string;
  userId: string;
}): Promise<string | null> => {
  try {
    const stored = await storeChatAttachment({
      bytes: params.bytes,
      contentType: params.contentType,
      fileName: voiceNoteFileName(params.contentType),
      threadId: null,
      uploadedBy: params.userId,
    });
    if (!stored) {
      console.warn("[transcribe] retain-failed", { reason: "insert" });
      return null;
    }
    return stored.id;
  } catch (error) {
    console.warn("[transcribe] retain-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

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

  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json(
      { error: "An audio recording is required" },
      { status: 400 }
    );
  }
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Recordings must be between 1 byte and 5 MB" },
      { status: 400 }
    );
  }
  if (!isAcceptedAudioType(audio.type)) {
    return NextResponse.json(
      { error: "Only audio recordings can be transcribed" },
      { status: 400 }
    );
  }

  let ai: Ai;
  try {
    const { env } = getCloudflareContext();
    if (typeof env.AI?.run !== "function") {
      throw new Error("AI binding unavailable");
    }
    ai = env.AI;
  } catch {
    return NextResponse.json(
      { error: "Voice transcription is not available in this environment." },
      { status: 503 }
    );
  }

  // Read once, shared by transcription (base64) and retention (R2 bytes).
  const audioBytes = await audio.arrayBuffer();
  // Base64 via Buffer (nodejs_compat): chunk-safe, no giant argument spreads.
  const base64 = Buffer.from(audioBytes).toString("base64");

  let timer: ReturnType<typeof setTimeout> | undefined;
  let result: unknown;
  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), TRANSCRIBE_TIMEOUT_MS);
    });
    result = await Promise.race([
      ai.run(TRANSCRIBE_MODEL, { audio: base64 }),
      timeout,
    ]);
  } catch (error) {
    console.warn("[transcribe] run-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Transcription failed. Try again." },
      { status: 502 }
    );
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }

  if (result === "timeout") {
    return NextResponse.json(
      { error: "Transcription took too long. Try again." },
      { status: 504 }
    );
  }

  const text =
    result !== null && typeof result === "object"
      ? (result as { text?: unknown }).text
      : undefined;
  if (typeof text !== "string") {
    return NextResponse.json(
      { error: "Transcription failed. Try again." },
      { status: 502 }
    );
  }

  const attachmentId = await retainVoiceNote({
    bytes: audioBytes,
    contentType: audio.type,
    userId,
  });

  return NextResponse.json({ attachmentId, text });
}
