import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { knowledgeChunk, knowledgeDoc } from "./schema";

// Loads the company knowledge corpus (knowledge/*.md) into Postgres so the
// assistant's search_knowledge_base tool can retrieve it. Re-runnable: each doc
// is upserted by slug and its chunks are replaced. Mirrors seed.ts (tsx +
// dotenv, run via `npm run knowledge:import`).

const KNOWLEDGE_DIR = join(process.cwd(), "knowledge");
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;
const HEADING = /^##\s+(.*)$/;
const MD_EXTENSION = /\.md$/;

interface ParsedDoc {
  category: string | null;
  content: string;
  slug: string;
  title: string;
}

interface ParsedChunk {
  content: string;
  heading: string | null;
  position: number;
}

const parseFrontmatter = (
  raw: string
): { body: string; meta: Record<string, string> } => {
  const match = FRONTMATTER.exec(raw);
  if (!match) {
    return { body: raw, meta: {} };
  }
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) {
      meta[key] = value;
    }
  }
  return { body: raw.slice(match[0].length), meta };
};

const parseDoc = (fileName: string, raw: string): ParsedDoc => {
  const { body, meta } = parseFrontmatter(raw);
  const slug = meta.slug ?? fileName.replace(MD_EXTENSION, "");
  return {
    category: meta.category ?? null,
    content: body.trim(),
    slug,
    title: meta.title ?? slug,
  };
};

// Split the body into chunks at each `## ` heading so retrieval returns small,
// precise passages. Text before the first heading becomes an intro chunk.
const splitChunks = (body: string): ParsedChunk[] => {
  const chunks: ParsedChunk[] = [];
  let heading: string | null = null;
  let buffer: string[] = [];
  let position = 0;

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content.length > 0) {
      chunks.push({ content, heading, position });
      position += 1;
    }
    buffer = [];
  };

  for (const line of body.split("\n")) {
    const match = HEADING.exec(line);
    if (match) {
      flush();
      heading = match[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
};

const importDoc = async (parsed: ParsedDoc) => {
  const now = new Date();
  const [existing] = await db
    .select({ id: knowledgeDoc.id })
    .from(knowledgeDoc)
    .where(eq(knowledgeDoc.slug, parsed.slug))
    .limit(1);

  let docId: string;
  if (existing) {
    docId = existing.id;
    await db
      .update(knowledgeDoc)
      .set({
        category: parsed.category,
        content: parsed.content,
        title: parsed.title,
        updatedAt: now,
      })
      .where(eq(knowledgeDoc.id, docId));
    await db.delete(knowledgeChunk).where(eq(knowledgeChunk.docId, docId));
  } else {
    docId = crypto.randomUUID();
    await db.insert(knowledgeDoc).values({
      category: parsed.category,
      content: parsed.content,
      id: docId,
      slug: parsed.slug,
      title: parsed.title,
    });
  }

  const chunks = splitChunks(parsed.content);
  if (chunks.length > 0) {
    await db.insert(knowledgeChunk).values(
      chunks.map((chunk) => ({
        content: chunk.content,
        docId,
        heading: chunk.heading,
        position: chunk.position,
      }))
    );
  }
  process.stdout.write(
    `Imported ${parsed.slug} (${chunks.length} chunk${chunks.length === 1 ? "" : "s"}).\n`
  );
};

const run = async () => {
  const files = readdirSync(KNOWLEDGE_DIR).filter((name) =>
    name.endsWith(".md")
  );
  if (files.length === 0) {
    process.stdout.write("No knowledge docs found in knowledge/.\n");
    return;
  }
  for (const file of files) {
    const raw = readFileSync(join(KNOWLEDGE_DIR, file), "utf8");
    await importDoc(parseDoc(file, raw));
  }
  process.stdout.write(`Knowledge import complete: ${files.length} doc(s).\n`);
};

const main = async () => {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`Knowledge import failed: ${String(error)}\n`);
    process.exitCode = 1;
  }
};

main();
