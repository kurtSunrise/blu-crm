"use client";

import { useComposerRuntime } from "@assistant-ui/react";
import { Loader2Icon, MicIcon, SquareIcon } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";

// Voice capture for the composer: record with MediaRecorder, transcribe via
// /api/chat/transcribe (Workers AI Whisper), and append the transcript to the
// composer text. Never auto-sends; the user reviews before sending.

type VoiceState = "idle" | "recording" | "transcribing";

const MAX_RECORDING_MS = 60_000;
const ELAPSED_TICK_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const HTTP_SERVICE_UNAVAILABLE = 503;

// First supported container wins: webm/opus (Chrome, Firefox), plain webm,
// then mp4/AAC (iOS and macOS Safari).
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

const MIC_BLOCKED_MESSAGE =
  "Microphone access is blocked. Allow it in your browser settings.";
const UNAVAILABLE_MESSAGE = "Voice input is not available here.";
const GENERIC_MESSAGE = "Could not transcribe that. Try again.";

const pickMimeType = (): string | undefined =>
  MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));

const isPermissionError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === "NotAllowedError" || error.name === "NotFoundError");

const formatElapsed = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export function VoiceInputButton({
  inputRef,
  onError,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onError: (message: string | null) => void;
}) {
  const composerRuntime = useComposerRuntime();
  const [state, setState] = useState<VoiceState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // MediaRecorder support is probed after mount so server and first client
  // render agree (the button is simply absent where recording cannot work).
  const [supported, setSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSupported(typeof MediaRecorder !== "undefined");
  }, []);

  const clearTimers = useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoStopRef.current !== null) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
  }, []);

  // Unmount cleanup: stop any live recording and release the microphone.
  useEffect(
    () => () => {
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        // Detach the handler first so no transcription fires after unmount.
        recorder.onstop = null;
        recorder.stop();
      }
      releaseStream();
    },
    [clearTimers, releaseStream]
  );

  const transcribe = useCallback(
    async (blob: Blob) => {
      setState("transcribing");
      try {
        const form = new FormData();
        form.append("audio", blob);
        const response = await fetch("/api/chat/transcribe", {
          body: form,
          method: "POST",
        });
        if (response.status === HTTP_SERVICE_UNAVAILABLE) {
          onError(UNAVAILABLE_MESSAGE);
          return;
        }
        if (!response.ok) {
          onError(GENERIC_MESSAGE);
          return;
        }
        const payload = (await response.json()) as { text?: string };
        const transcript = payload.text?.trim();
        if (!transcript) {
          onError(GENERIC_MESSAGE);
          return;
        }
        const current = composerRuntime.getState().text;
        composerRuntime.setText(
          current ? `${current} ${transcript}` : transcript
        );
        inputRef.current?.focus();
      } catch {
        onError(GENERIC_MESSAGE);
      } finally {
        setState("idle");
      }
    },
    [composerRuntime, inputRef, onError]
  );

  const stopRecording = useCallback(() => {
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, [clearTimers]);

  const startRecording = useCallback(async () => {
    onError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        recorderRef.current = null;
        releaseStream();
        transcribe(blob).catch(() => {
          // transcribe handles its own errors; this guards the promise chain
        });
      };
      recorder.start();
      setElapsedSeconds(0);
      setState("recording");
      tickRef.current = setInterval(
        () => setElapsedSeconds((seconds) => seconds + 1),
        ELAPSED_TICK_MS
      );
      autoStopRef.current = setTimeout(stopRecording, MAX_RECORDING_MS);
    } catch (error) {
      releaseStream();
      onError(isPermissionError(error) ? MIC_BLOCKED_MESSAGE : GENERIC_MESSAGE);
      setState("idle");
    }
  }, [onError, releaseStream, stopRecording, transcribe]);

  if (!supported) {
    return null;
  }

  if (state === "transcribing") {
    return (
      <Button
        aria-label="Transcribing"
        className="size-11 shrink-0 rounded-full"
        disabled
        size="icon"
        type="button"
        variant="ghost"
      >
        <Loader2Icon aria-hidden className="size-5 animate-spin" />
      </Button>
    );
  }

  if (state === "recording") {
    return (
      <Button
        aria-label={`Stop recording, ${formatElapsed(elapsedSeconds)} elapsed`}
        aria-pressed
        className="h-11 w-auto shrink-0 gap-1.5 rounded-full px-3 text-destructive"
        onClick={stopRecording}
        size="icon"
        type="button"
        variant="ghost"
      >
        <MicIcon aria-hidden className="size-5 animate-pulse" />
        <span aria-hidden className="font-mono text-xs tabular-nums">
          {formatElapsed(elapsedSeconds)}
        </span>
        <SquareIcon aria-hidden className="size-3 fill-current" />
      </Button>
    );
  }

  return (
    <Button
      aria-label="Record a voice note"
      aria-pressed={false}
      className="size-11 shrink-0 rounded-full"
      onClick={() => {
        startRecording().catch(() => {
          // startRecording handles its own errors
        });
      }}
      size="icon"
      type="button"
      variant="ghost"
    >
      <MicIcon aria-hidden className="size-5" />
    </Button>
  );
}
