// Minimal RFC 4180 CSV parser and writer: quoted fields, escaped quotes,
// commas and newlines inside quotes, CRLF or LF line endings. No external
// dependency.

export type CsvValue = number | string | null | undefined;

const NEEDS_QUOTING = /[",\n\r]/;
// Cells starting with a formula trigger would execute when the CSV is opened
// in a spreadsheet; a leading apostrophe forces text. Numbers are exempt so a
// negative value doesn't get mangled.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const escapeCell = (value: CsvValue): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return String(value);
  }
  let text = value;
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  if (NEEDS_QUOTING.test(text)) {
    text = `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

// Report exports are hundreds of rows at most, so building the string in
// memory (no streaming) is fine.
export const toCsv = (headers: string[], rows: CsvValue[][]): string => {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
};

export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      index += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      index += 1;
      continue;
    }
    if (char === "\r") {
      // Treat CRLF as one break; lone CR is ignored.
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (field !== "" || row.length > 0) {
    pushRow();
  }

  // Drop fully empty rows (trailing newlines, blank lines).
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
};
