import { strFromU8, type Unzipped, unzip } from "fflate";

// Turns an uploaded Office document (the raw R2 blob) into plain text, the
// first transform in the document semantic layer. OOXML files (.docx/.xlsx/
// .pptx) are ZIP archives of XML, so we unzip only the parts that hold text and
// strip the markup. Legacy OLE binaries (.doc/.xls/.ppt) are not ZIPs and are
// not supported; extractOfficeText returns null for them (the file is still
// stored and downloadable, just not machine-read).

// Hoisted to module scope (Biome useTopLevelRegex): these run per document.
const SLIDE_NUMBER_RE = /slide(\d+)\.xml$/;
const SLIDE_ENTRY_RE = /^ppt\/slides\/slide\d+\.xml$/;
const SHEET_ENTRY_RE = /^xl\/worksheets\/sheet\d+\.xml$/;
const INLINE_STRING_RE = /<is>([\s\S]*?)<\/is>/g;
const TAG_RE = /<[^>]+>/g;
const DOCX_TAB_RE = /<w:tab\b[^>]*\/>/g;
const DOCX_BREAK_RE = /<w:br\b[^>]*\/?>/g;
// Deleted (tracked-change) text and field instruction codes are not document
// content; drop the whole element so it never reaches the text or the index.
const DOCX_DELTEXT_RE = /<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g;
const DOCX_INSTRTEXT_RE = /<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g;
const HEX_ENTITY_RE = /&#x([0-9a-fA-F]+);/g;
const DEC_ENTITY_RE = /&#(\d+);/g;
const NAMED_ENTITY_RE = /&(amp|lt|gt|quot|apos);/g;
const INLINE_WS_RE = /[ \t]+/g;
const BLANK_LINES_RE = /\n{3,}/g;

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const OFFICE_EXTRACTABLE_TYPES = new Set([
  DOCX_TYPE,
  XLSX_TYPE,
  PPTX_TYPE,
]);

export const isOfficeExtractable = (contentType: string | null): boolean =>
  contentType !== null && OFFICE_EXTRACTABLE_TYPES.has(contentType);

// Hard ceiling on extracted text so a large workbook cannot blow the turn's
// token budget or the Worker CPU limit. ~100k chars is roughly 25k tokens.
const MAX_EXTRACTED_CHARS = 100_000;

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

const unescapeXml = (value: string): string =>
  value
    .replaceAll(HEX_ENTITY_RE, (_m, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replaceAll(DEC_ENTITY_RE, (_m, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    )
    .replaceAll(NAMED_ENTITY_RE, (entity) => XML_ENTITIES[entity] ?? entity);

// Collapse runs of blank lines and trailing spaces so the extracted text reads
// cleanly and does not waste tokens on layout whitespace.
const tidy = (value: string): string =>
  value
    .split("\n")
    .map((line) => line.replace(INLINE_WS_RE, " ").trim())
    .join("\n")
    .replaceAll(BLANK_LINES_RE, "\n\n")
    .trim();

// Strip every XML tag, leaving only text nodes. In OOXML body parts the only
// text nodes live inside the run elements (w:t / a:t / t), so callers first
// convert the structural boundaries they care about (paragraph, tab, cell) into
// literal whitespace, then hand the markup here.
const stripTags = (xml: string): string => xml.replaceAll(TAG_RE, "");

const extractDocx = (files: Unzipped): string => {
  const raw = files["word/document.xml"];
  if (!raw) {
    return "";
  }
  const xml = strFromU8(raw)
    .replaceAll(DOCX_DELTEXT_RE, "")
    .replaceAll(DOCX_INSTRTEXT_RE, "")
    .replaceAll(DOCX_TAB_RE, "\t")
    .replaceAll(DOCX_BREAK_RE, "\n")
    .replaceAll("</w:p>", "\n");
  return unescapeXml(stripTags(xml));
};

const slideNumber = (name: string): number => {
  const match = name.match(SLIDE_NUMBER_RE);
  return match?.[1] ? Number.parseInt(match[1], 10) : 0;
};

const extractPptx = (files: Unzipped): string => {
  const slideNames = Object.keys(files)
    .filter((name) => SLIDE_ENTRY_RE.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  const slides = slideNames.map((name, index) => {
    const raw = files[name];
    const xml = (raw ? strFromU8(raw) : "").replaceAll("</a:p>", "\n");
    const text = unescapeXml(stripTags(xml)).trim();
    return `Slide ${index + 1}\n${text}`;
  });
  return slides.join("\n\n");
};

const extractXlsx = (files: Unzipped): string => {
  const parts: string[] = [];
  // Shared strings hold most textual cell content (labels, headers, notes).
  const shared = files["xl/sharedStrings.xml"];
  if (shared) {
    const xml = strFromU8(shared).replaceAll("</si>", "\n");
    const text = unescapeXml(stripTags(xml)).trim();
    if (text) {
      parts.push(text);
    }
  }
  // Inline strings live directly in the sheet as <is><t>...</t></is>; plain
  // numeric cells reference shared strings by index, so we deliberately skip
  // <v> to avoid dumping meaningless indices.
  for (const [name, bytes] of Object.entries(files)) {
    if (!SHEET_ENTRY_RE.test(name)) {
      continue;
    }
    const sheetXml = strFromU8(bytes);
    for (const match of sheetXml.matchAll(INLINE_STRING_RE)) {
      const inner = match[1];
      if (!inner) {
        continue;
      }
      const text = unescapeXml(stripTags(inner)).trim();
      if (text) {
        parts.push(text);
      }
    }
  }
  return parts.join("\n");
};

// Only decompress the entries each format actually needs, so a large workbook
// or deck does not expand every embedded media asset in memory.
const isWantedEntry = (name: string, contentType: string): boolean => {
  if (contentType === DOCX_TYPE) {
    return name === "word/document.xml";
  }
  if (contentType === PPTX_TYPE) {
    return SLIDE_ENTRY_RE.test(name);
  }
  if (contentType === XLSX_TYPE) {
    return name === "xl/sharedStrings.xml" || SHEET_ENTRY_RE.test(name);
  }
  return false;
};

const unzipWanted = (
  bytes: Uint8Array,
  contentType: string
): Promise<Unzipped> =>
  new Promise((resolve, reject) => {
    unzip(
      bytes,
      { filter: (file) => isWantedEntry(file.name, contentType) },
      (err, data) => (err ? reject(err) : resolve(data))
    );
  });

// Extract plain text from an OOXML document. Returns null for unsupported types
// or when the archive cannot be read (corrupt upload, legacy binary format),
// so callers treat "no text" and "not extractable" the same way.
export const extractOfficeText = async (
  buffer: ArrayBuffer,
  contentType: string
): Promise<string | null> => {
  if (!OFFICE_EXTRACTABLE_TYPES.has(contentType)) {
    return null;
  }
  try {
    const files = await unzipWanted(new Uint8Array(buffer), contentType);
    let text = "";
    if (contentType === DOCX_TYPE) {
      text = extractDocx(files);
    } else if (contentType === PPTX_TYPE) {
      text = extractPptx(files);
    } else if (contentType === XLSX_TYPE) {
      text = extractXlsx(files);
    }
    const tidied = tidy(text);
    if (tidied.length === 0) {
      return null;
    }
    return tidied.slice(0, MAX_EXTRACTED_CHARS);
  } catch {
    return null;
  }
};

const DEFAULT_CHUNK_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 150;

// Size-windowed chunker for extracted document text. The knowledge chunker
// splits on `## ` headings, which extracted prose lacks, so it would collapse a
// whole document into one oversized chunk. This windows by character count and
// prefers to cut on a paragraph or word boundary near the window edge so a
// chunk does not end mid-sentence.
export const splitTextChunks = (
  text: string,
  options?: { maxChars?: number; overlap?: number }
): string[] => {
  const maxChars = options?.maxChars ?? DEFAULT_CHUNK_CHARS;
  const overlap = Math.min(
    options?.overlap ?? DEFAULT_OVERLAP_CHARS,
    maxChars - 1
  );
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + maxChars, trimmed.length);
    if (end < trimmed.length) {
      const window = trimmed.slice(start, end);
      const breakAt = Math.max(
        window.lastIndexOf("\n"),
        window.lastIndexOf(". ")
      );
      // Only honour a boundary in the back half of the window, so we never
      // produce a tiny chunk chasing a break near the start.
      if (breakAt > maxChars * 0.5) {
        end = start + breakAt + 1;
      }
    }
    const chunk = trimmed.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (end >= trimmed.length) {
      break;
    }
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
};
