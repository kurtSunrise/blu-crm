import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatArtifact } from "@/db/schema";
import type { ArtifactPayload } from "@/lib/ai/stream-protocol";

// Persistence for streamed artifact payloads (deal cards, deal lists,
// drafts) so resumed threads re-render their cards. Rows anchor to the
// chat_message they were emitted with; the message is always inserted first,
// so a failure here just leaves a card-less transcript, never an orphan.

const THREAD_ARTIFACT_LIMIT = 200;

export interface StoredArtifact {
  artifactType: string;
  data: unknown;
  id: string;
  messageId: string;
  position: number;
}

export const saveMessageArtifacts = async (
  threadId: string,
  messageId: string,
  artifacts: ArtifactPayload[],
  startPosition = 0
): Promise<void> => {
  if (artifacts.length === 0) {
    return;
  }
  // One batch insert: a single statement is atomic on the Neon HTTP driver.
  await db.insert(chatArtifact).values(
    artifacts.map((artifact, index) => ({
      artifactType: artifact.artifactType,
      data: artifact.data,
      messageId,
      position: startPosition + index,
      threadId,
    }))
  );
};

// All artifacts for a thread; consumers group by messageId, and position
// (unique within a message) orders cards inside each message.
export const loadArtifactsForThread = async (
  threadId: string
): Promise<StoredArtifact[]> =>
  await db
    .select({
      artifactType: chatArtifact.artifactType,
      data: chatArtifact.data,
      id: chatArtifact.id,
      messageId: chatArtifact.messageId,
      position: chatArtifact.position,
    })
    .from(chatArtifact)
    .where(eq(chatArtifact.threadId, threadId))
    .orderBy(asc(chatArtifact.position), asc(chatArtifact.createdAt))
    .limit(THREAD_ARTIFACT_LIMIT);
