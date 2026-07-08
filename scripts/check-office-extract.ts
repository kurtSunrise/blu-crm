// Regression guard for the Office text extractor (src/lib/ai/office-extract.ts).
// The repo has no unit-test framework, so this is a standalone tsx check wired
// to `npm run test:office-extract`. It builds minimal but valid OOXML archives
// with fflate and asserts the extracted text, the exclusions (tracked-change
// and field-code content), and the chunker. Exits non-zero on any failure.
//
//   npm run test:office-extract

import { strToU8, zipSync } from "fflate";
import {
  extractOfficeText,
  splitTextChunks,
} from "../src/lib/ai/office-extract";

const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const zip = (entries: Record<string, string>): ArrayBuffer => {
  const files: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(entries)) {
    files[name] = strToU8(content);
  }
  const out = zipSync(files);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
};

let failures = 0;

const pass = (label: string) => process.stdout.write(`PASS ${label}\n`);
const fail = (label: string, detail: string) => {
  failures += 1;
  process.stdout.write(`FAIL ${label}\n  ${detail}\n`);
};

const expectIncludes = (
  label: string,
  actual: string | null,
  needles: string[]
) => {
  if (actual === null) {
    fail(label, "got null");
    return;
  }
  const missing = needles.filter((n) => !actual.includes(n));
  if (missing.length === 0) {
    pass(label);
  } else {
    fail(
      label,
      `missing ${JSON.stringify(missing)} in ${JSON.stringify(actual)}`
    );
  }
};

const expectExcludes = (
  label: string,
  actual: string | null,
  forbidden: string[]
) => {
  if (actual === null) {
    fail(label, "got null");
    return;
  }
  const present = forbidden.filter((n) => actual.includes(n));
  if (present.length === 0) {
    pass(label);
  } else {
    fail(label, `should not contain ${JSON.stringify(present)}`);
  }
};

const expectNull = (label: string, actual: string | null) => {
  if (actual === null) {
    pass(label);
  } else {
    fail(label, `expected null, got ${JSON.stringify(actual)}`);
  }
};

const run = async () => {
  // docx: paragraph breaks, entity unescaping, and exclusion of tracked-change
  // deleted text (<w:delText>) and field instruction codes (<w:instrText>).
  const docx = zip({
    "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
      <w:p><w:r><w:t>Kitchen fit-out for Bunnings</w:t></w:r></w:p>
      <w:p><w:r><w:t>Budget is $45,000 &amp; due 12/08</w:t></w:r>
        <w:r><w:delText>DELETED DRAFT TEXT</w:delText></w:r>
        <w:r><w:instrText> HYPERLINK "http://example.com" </w:instrText></w:r>
      </w:p>
    </w:body></w:document>`,
  });
  const docxText = await extractOfficeText(docx, DOCX);
  expectIncludes("docx content", docxText, [
    "Kitchen fit-out for Bunnings",
    "Budget is $45,000 & due 12/08",
  ]);
  expectExcludes("docx excludes tracked-change/field text", docxText, [
    "DELETED DRAFT TEXT",
    "HYPERLINK",
  ]);

  const pptx = zip({
    "ppt/slides/slide1.xml": `<p:sld xmlns:a="a"><a:p><a:r><a:t>Retail Display Proposal</a:t></a:r></a:p><a:p><a:r><a:t>Prepared for Coles</a:t></a:r></a:p></p:sld>`,
    "ppt/slides/slide2.xml": `<p:sld xmlns:a="a"><a:p><a:r><a:t>Timeline: 6 weeks</a:t></a:r></a:p></p:sld>`,
  });
  expectIncludes(
    "pptx content + slide order",
    await extractOfficeText(pptx, PPTX),
    [
      "Slide 1",
      "Retail Display Proposal",
      "Prepared for Coles",
      "Slide 2",
      "Timeline: 6 weeks",
    ]
  );

  const xlsx = zip({
    "xl/sharedStrings.xml": `<sst xmlns="s"><si><t>Item</t></si><si><t>Plywood sheets</t></si><si><t>Qty</t></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row><c t="inlineStr"><is><t>Inline note here</t></is></c></row></sheetData></worksheet>`,
  });
  expectIncludes(
    "xlsx shared + inline strings",
    await extractOfficeText(xlsx, XLSX),
    ["Plywood sheets", "Qty", "Inline note here"]
  );

  expectNull(
    "legacy .doc returns null",
    await extractOfficeText(new ArrayBuffer(8), "application/msword")
  );
  expectNull(
    "corrupt archive returns null",
    await extractOfficeText(strToU8("not a zip").buffer as ArrayBuffer, DOCX)
  );

  // Chunker: long text windows with overlap; short text stays one chunk.
  const long = Array.from(
    { length: 50 },
    (_, i) => `Paragraph ${i} about the build.`
  ).join("\n");
  const chunks = splitTextChunks(long, { maxChars: 200, overlap: 40 });
  if (chunks.length > 1 && chunks.every((c) => c.length <= 260)) {
    pass(`chunker windows long text (${chunks.length} chunks)`);
  } else {
    fail("chunker windows long text", `chunks=${chunks.length}`);
  }
  if (splitTextChunks("short text", { maxChars: 200 }).length === 1) {
    pass("chunker keeps short text as one chunk");
  } else {
    fail("chunker keeps short text as one chunk", "expected 1 chunk");
  }

  if (failures === 0) {
    process.stdout.write("\nALL PASS\n");
  } else {
    process.stdout.write(`\n${failures} FAILED\n`);
    process.exit(1);
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`office-extract check crashed: ${String(error)}\n`);
  process.exit(1);
});
