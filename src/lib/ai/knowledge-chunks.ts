// Pure parsing and chunking for the knowledge corpus, shared by the CLI
// importer (src/db/knowledge-import.ts) and the in-app knowledge admin
// actions. No filesystem or database access here: raw markdown in, parsed
// metadata and chunks out, so both write paths chunk identically.

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;
const HEADING = /^##\s+(.*)$/;

export interface ParsedKnowledgeDoc {
  category: string | null;
  content: string;
  slug: string;
  title: string;
}

export interface ParsedKnowledgeChunk {
  content: string;
  heading: string | null;
  position: number;
}

export const parseKnowledgeFrontmatter = (
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

// Parse a full markdown file (frontmatter + body) into doc metadata. The
// fallback slug covers files without a `slug:` frontmatter key; the CLI
// passes the file name minus its extension.
export const parseKnowledgeDoc = (
  fallbackSlug: string,
  raw: string
): ParsedKnowledgeDoc => {
  const { body, meta } = parseKnowledgeFrontmatter(raw);
  const slug = meta.slug ?? fallbackSlug;
  return {
    category: meta.category ?? null,
    content: body.trim(),
    slug,
    title: meta.title ?? slug,
  };
};

// Split the body into chunks at each `## ` heading so retrieval returns small,
// precise passages. Text before the first heading becomes an intro chunk.
export const splitKnowledgeChunks = (body: string): ParsedKnowledgeChunk[] => {
  const chunks: ParsedKnowledgeChunk[] = [];
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

// The text a chunk is embedded as: heading-prefixed so the vector carries the
// section context. Both the CLI importer and the admin save use this, keeping
// the stored vectors comparable regardless of which path wrote them.
export const chunkEmbeddingText = (chunk: ParsedKnowledgeChunk): string =>
  `${chunk.heading ? `${chunk.heading}\n` : ""}${chunk.content}`;
