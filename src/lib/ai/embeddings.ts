import { getCloudflareContext } from "@opennextjs/cloudflare";

// Embedding access for the knowledge corpus, one model on three paths:
// - embedQuery runs on the deployed Worker via the Workers AI binding (env.AI)
//   and powers hybrid retrieval in src/lib/ai/knowledge.ts. It is strictly
//   best-effort: any failure (no binding in `next dev`, slow model, bad
//   response) returns null and the caller falls back to full-text search, so
//   a chat turn can never stall on an embed call.
// - embedTextsViaBinding embeds a batch of chunk texts through the same
//   binding when an admin saves a knowledge doc in the app. Also best-effort:
//   failed or timed-out chunks come back null and stay unembedded (full-text
//   search still covers them; a re-save retries).
// - embedTextsViaRest runs from Node scripts (src/db/knowledge-import.ts)
//   through the Workers AI REST API using account credentials, because the
//   binding does not exist outside the Worker.

export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const EMBEDDING_DIMENSIONS = 1024;

// The largest batch a single REST call may carry; callers slice above this.
export const EMBEDDING_BATCH_LIMIT = 100;

// A warm bge-m3 call returns in well under a second; anything slower is worth
// abandoning because full-text search alone still answers the question.
const EMBED_TIMEOUT_MS = 2000;

const RETRY_DELAY_MS = 750;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;
const ERROR_BODY_PREVIEW_CHARS = 300;

const isEmbeddingVector = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length === EMBEDDING_DIMENSIONS &&
  value.every((component) => typeof component === "number");

// Both the binding and the REST API return `{ data: number[][] }` for the
// plain-embedding input shape (`{ text: string[] }`).
const extractVectors = (payload: unknown): unknown[] | null => {
  if (payload === null || typeof payload !== "object") {
    return null;
  }
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data : null;
};

// Embed a single query on the Worker. Returns null on ANY failure so callers
// degrade to full-text search; the one warn line keeps the fallback observable.
export const embedQuery = async (text: string): Promise<number[] | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { env } = getCloudflareContext();
    const ai = env.AI;
    if (typeof ai?.run !== "function") {
      console.warn("[knowledge] embed-fallback", { reason: "no-ai-binding" });
      return null;
    }
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), EMBED_TIMEOUT_MS);
    });
    const raced = await Promise.race([
      ai.run(EMBEDDING_MODEL, { text: [text] }),
      timeout,
    ]);
    if (raced === "timeout") {
      console.warn("[knowledge] embed-fallback", {
        reason: "timeout",
        timeoutMs: EMBED_TIMEOUT_MS,
      });
      return null;
    }
    const vector = extractVectors(raced)?.[0];
    if (!isEmbeddingVector(vector)) {
      console.warn("[knowledge] embed-fallback", { reason: "bad-response" });
      return null;
    }
    return vector;
  } catch (error) {
    console.warn("[knowledge] embed-fallback", {
      reason: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};

type AiBinding = ReturnType<typeof getCloudflareContext>["env"]["AI"];

// Overall time budget for embedding one doc during an admin save. A save must
// never hang on the model: whatever is not embedded when the budget runs out
// stays null and full-text search covers it until the next save.
const SAVE_EMBED_BUDGET_MS = 10_000;

// One binding call for one batch, raced against the remaining budget. Returns
// the raw vector payloads (validated per-entry by the caller) or null when the
// batch as a whole failed or timed out.
const runEmbedBatch = async (
  ai: AiBinding,
  batch: string[],
  timeoutMs: number
): Promise<unknown[] | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const raced = await Promise.race([
      ai.run(EMBEDDING_MODEL, { text: batch }),
      timeout,
    ]);
    if (raced === "timeout") {
      console.warn("[knowledge] embed-fallback", {
        reason: "timeout",
        timeoutMs,
      });
      return null;
    }
    const vectors = extractVectors(raced);
    if (!vectors || vectors.length !== batch.length) {
      console.warn("[knowledge] embed-fallback", { reason: "bad-response" });
      return null;
    }
    return vectors;
  } catch (error) {
    console.warn("[knowledge] embed-fallback", {
      reason: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};

// Embed a batch of texts on the Worker (or the simulated dev binding from
// initOpenNextCloudflareForDev). Best-effort by design: the result always has
// one entry per input text, null where embedding failed, so callers can store
// chunks regardless and hybrid search degrades to full-text for null rows.
export const embedTextsViaBinding = async (
  texts: string[]
): Promise<(number[] | null)[]> => {
  const results: (number[] | null)[] = texts.map(() => null);
  if (texts.length === 0) {
    return results;
  }

  let ai: AiBinding | undefined;
  try {
    ai = getCloudflareContext().env.AI;
  } catch {
    ai = undefined;
  }
  if (typeof ai?.run !== "function") {
    console.warn("[knowledge] embed-fallback", { reason: "no-ai-binding" });
    return results;
  }

  const deadline = Date.now() + SAVE_EMBED_BUDGET_MS;
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_LIMIT) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      console.warn("[knowledge] embed-fallback", {
        embedded: start,
        reason: "budget-exhausted",
      });
      break;
    }
    const batch = texts.slice(start, start + EMBEDDING_BATCH_LIMIT);
    const vectors = await runEmbedBatch(ai, batch, remainingMs);
    if (!vectors) {
      // A failed batch usually means the model or binding is struggling;
      // later batches would burn the budget the same way, so stop here.
      break;
    }
    for (const [index, vector] of vectors.entries()) {
      results[start + index] = isEmbeddingVector(vector) ? vector : null;
    }
  }
  return results;
};

const shouldRetry = (status: number): boolean =>
  status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR_MIN;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Embed a batch of texts through the Workers AI REST API (Node script path).
// Throws on hard failure; import scripts surface the error instead of silently
// writing null embeddings.
export const embedTextsViaRest = async (
  texts: string[],
  creds: { accountId: string; apiToken: string }
): Promise<number[][]> => {
  if (texts.length === 0) {
    return [];
  }
  if (texts.length > EMBEDDING_BATCH_LIMIT) {
    throw new Error(
      `Embedding batches are limited to ${EMBEDDING_BATCH_LIMIT} texts; got ${texts.length}. Slice before calling.`
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/ai/run/${EMBEDDING_MODEL}`;
  const send = () =>
    fetch(url, {
      body: JSON.stringify({ text: texts }),
      headers: {
        authorization: `Bearer ${creds.apiToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    });

  let response = await send();
  if (shouldRetry(response.status)) {
    await sleep(RETRY_DELAY_MS);
    response = await send();
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Workers AI embedding request failed (${response.status}): ${body.slice(0, ERROR_BODY_PREVIEW_CHARS)}`
    );
  }

  const payload: unknown = await response.json();
  const success =
    payload !== null &&
    typeof payload === "object" &&
    (payload as { success?: unknown }).success === true;
  const result = success ? (payload as { result?: unknown }).result : null;
  const vectors = extractVectors(result);
  if (!vectors) {
    throw new Error("Workers AI embedding response had no result.data array.");
  }
  if (vectors.length !== texts.length) {
    throw new Error(
      `Workers AI returned ${vectors.length} embeddings for ${texts.length} texts.`
    );
  }
  return vectors.map((vector, index) => {
    if (!isEmbeddingVector(vector)) {
      throw new Error(
        `Workers AI embedding ${index} is not a ${EMBEDDING_DIMENSIONS}-dimension number vector.`
      );
    }
    return vector;
  });
};
