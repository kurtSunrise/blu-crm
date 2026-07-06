// Backfills knowledge_chunk.embedding using the Workers AI binding through
// wrangler's platform proxy (the same remote binding `next dev` uses), so no
// CLOUDFLARE_API_TOKEN is needed; the wrangler OAuth login carries it.
//
//   dotenv -e .env.local      -- tsx scripts/backfill-knowledge-embeddings.ts
//   dotenv -e .env.production -- tsx scripts/backfill-knowledge-embeddings.ts
//
// Idempotent: only rows with a null embedding are touched unless --force.
// Each update is a single statement, so any prefix is recoverable.

import pg from "pg";
import { getPlatformProxy } from "wrangler";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "../src/lib/ai/embeddings";

const readDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set (run via dotenv -e <env file>).");
  }
  return url;
};

interface ChunkRow {
  content: string;
  heading: string | null;
  id: string;
}

const run = async (): Promise<void> => {
  const force = process.argv.includes("--force");
  const proxy = await getPlatformProxy<{ AI: Ai }>();
  try {
    const ai = proxy.env.AI;
    if (typeof ai?.run !== "function") {
      throw new Error("AI binding unavailable via the platform proxy.");
    }

    const client = new pg.Client({ connectionString: readDatabaseUrl() });
    await client.connect();
    try {
      const { rows } = await client.query<ChunkRow>(
        `select id, heading, content from knowledge_chunk
         ${force ? "" : "where embedding is null"}
         order by id`
      );
      if (rows.length === 0) {
        process.stdout.write("Nothing to embed.\n");
        return;
      }
      const texts = rows.map((row) =>
        row.heading ? `${row.heading}\n${row.content}` : row.content
      );
      const result = (await ai.run(EMBEDDING_MODEL, { text: texts })) as {
        data?: number[][];
      };
      const vectors = result.data;
      if (!vectors || vectors.length !== rows.length) {
        throw new Error(
          `Embedding count mismatch: ${vectors?.length ?? 0} for ${rows.length} chunks`
        );
      }
      for (const [index, row] of rows.entries()) {
        const vector = vectors[index];
        if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(`Bad vector for chunk ${row.id}`);
        }
        await client.query(
          "update knowledge_chunk set embedding = $1::vector where id = $2",
          [JSON.stringify(vector), row.id]
        );
      }
      process.stdout.write(`Embedded ${rows.length} chunk(s).\n`);
    } finally {
      await client.end();
    }
  } finally {
    await proxy.dispose();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`embedding backfill failed: ${String(error)}\n`);
  process.exit(1);
});
