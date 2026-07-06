import { Buffer } from "node:buffer";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

// Transcribe a short voice recording from the assistant composer via Workers
// AI Whisper. The client posts multipart form data with an `audio` field and
// receives `{ text }` on success or `{ error }` with 400/401/502/503/504.
// Resolves PRD open question Q3: transcription path = Workers AI Whisper.

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

  // Base64 via Buffer (nodejs_compat) — chunk-safe, no giant argument spreads.
  const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");

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

  return NextResponse.json({ text });
}
