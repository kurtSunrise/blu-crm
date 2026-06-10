"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  commitContactImport,
  commitDealImport,
  type ImportCommitResult,
  previewContactImport,
} from "@/lib/actions/import-actions";
import { parseCsv } from "@/lib/csv";
import {
  CONTACT_IMPORT_FIELDS,
  DEAL_IMPORT_FIELDS,
} from "@/lib/validation/import";

const SELECT_CLASSES =
  "flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm";

const SKIP_COLUMN = "__skip__";
const PREVIEW_ROW_COUNT = 10;

type ImportKind = "contacts" | "deals";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  title: "Role / title",
  companyName: "Company",
  contactName: "Contact name",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  estimatedValueDollars: "Estimated value (AUD)",
  stageName: "Stage",
  ownerEmail: "Owner email",
  projectType: "Project type",
  venue: "Venue / location",
  scopeSummary: "Scope summary",
  fixedDate: "Fixed date",
};

// Auto-guess a target field from a CSV header.
const guessField = (header: string, fields: readonly string[]): string => {
  const normalised = header.toLowerCase().replaceAll(/[^a-z]/g, "");
  for (const field of fields) {
    if (field.toLowerCase().replaceAll(/[^a-z]/g, "") === normalised) {
      return field;
    }
  }
  const aliases: Record<string, string> = {
    company: "companyName",
    brand: "companyName",
    client: "companyName",
    mobile: "phone",
    role: "title",
    value: "estimatedValueDollars",
    budget: "estimatedValueDollars",
    stage: "stageName",
    owner: "ownerEmail",
    location: "venue",
    notes: "scopeSummary",
    deal: "title",
  };
  const alias = aliases[normalised];
  return alias && fields.includes(alias) ? alias : SKIP_COLUMN;
};

const buildRows = (
  data: string[][],
  mapping: string[]
): Record<string, string>[] =>
  data.map((cells) => {
    const row: Record<string, string> = {};
    mapping.forEach((field, columnIndex) => {
      const value = cells[columnIndex]?.trim() ?? "";
      if (field !== SKIP_COLUMN && value !== "") {
        row[field] = value;
      }
    });
    return row;
  });

export function CsvImport() {
  const [kind, setKind] = useState<ImportKind>("contacts");
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [duplicateNames, setDuplicateNames] = useState<Map<number, string[]>>(
    new Map()
  );
  const [importDuplicates, setImportDuplicates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const fields =
    kind === "contacts" ? CONTACT_IMPORT_FIELDS : DEAL_IMPORT_FIELDS;

  const reset = () => {
    setHeaders([]);
    setData([]);
    setMapping([]);
    setDuplicateNames(new Map());
    setResult(null);
    setError(null);
  };

  const handleFile = async (file: File | undefined) => {
    reset();
    if (!file) {
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setError("The CSV needs a header row and at least one data row.");
      return;
    }
    const [headerRow, ...dataRows] = parsed;
    setHeaders(headerRow);
    setData(dataRows);
    const initialMapping = headerRow.map((header) =>
      guessField(header, fields)
    );
    refreshPreview(dataRows, initialMapping);
  };

  const refreshPreview = (dataRows: string[][], nextMapping: string[]) => {
    setMapping(nextMapping);
    setDuplicateNames(new Map());
    if (kind !== "contacts") {
      return;
    }
    const rows = buildRows(dataRows, nextMapping);
    startTransition(async () => {
      const preview = await previewContactImport(rows);
      if (preview.rows) {
        setDuplicateNames(
          new Map(
            preview.rows
              .filter((row) => row.duplicateOf.length > 0)
              .map((row) => [row.index, row.duplicateOf])
          )
        );
        setError(null);
      } else {
        setError(preview.error ?? null);
      }
    });
  };

  const handleImport = () => {
    const rows = buildRows(data, mapping);
    startTransition(async () => {
      const outcome =
        kind === "contacts"
          ? await commitContactImport({ rows, importDuplicates })
          : await commitDealImport({ rows });
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      setResult(outcome);
      setError(null);
    });
  };

  const previewRows = data.slice(0, PREVIEW_ROW_COUNT);

  if (result) {
    return (
      <section
        aria-label="Import result"
        className="flex flex-col gap-3 rounded-lg border bg-card p-4"
      >
        <h3 className="font-heading font-medium text-sm">Import complete</h3>
        <p className="text-sm">
          {result.created} {kind === "contacts" ? "contacts" : "deals"} imported
          {result.skippedDuplicates
            ? `, ${result.skippedDuplicates} skipped as duplicates`
            : ""}
          .
        </p>
        <Button
          className="h-11 sm:max-w-48"
          onClick={reset}
          variant="secondary"
        >
          Import another file
        </Button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-kind">What are you importing?</Label>
          <select
            className={SELECT_CLASSES}
            id="import-kind"
            onChange={(event) => {
              setKind(event.target.value as ImportKind);
              reset();
            }}
            value={kind}
          >
            <option value="contacts">Contacts</option>
            <option value="deals">Open deals</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-file">CSV file</Label>
          <input
            accept=".csv,text/csv"
            className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-medium file:text-foreground"
            id="import-file"
            onChange={(event) => handleFile(event.target.files?.[0])}
            type="file"
          />
        </div>
      </div>

      {headers.length > 0 && (
        <>
          <section aria-label="Column mapping" className="flex flex-col gap-2">
            <h3 className="font-heading font-medium text-sm">
              Map your columns
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {headers.map((header, columnIndex) => (
                <div
                  className="flex items-center gap-2"
                  key={`${header}-${String(columnIndex)}`}
                >
                  <span className="w-1/2 truncate font-mono text-muted-foreground text-xs">
                    {header}
                  </span>
                  <select
                    aria-label={`Map column ${header}`}
                    className={SELECT_CLASSES}
                    onChange={(event) => {
                      const next = [...mapping];
                      next[columnIndex] = event.target.value;
                      refreshPreview(data, next);
                    }}
                    value={mapping[columnIndex] ?? SKIP_COLUMN}
                  >
                    <option value={SKIP_COLUMN}>Don't import</option>
                    {fields.map((field) => (
                      <option key={field} value={field}>
                        {FIELD_LABELS[field] ?? field}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Import preview" className="flex flex-col gap-2">
            <h3 className="font-heading font-medium text-sm">Preview</h3>
            <p className="text-muted-foreground text-xs">
              {data.length} rows in the file
              {data.length > PREVIEW_ROW_COUNT
                ? `, showing the first ${PREVIEW_ROW_COUNT}`
                : ""}
              .
            </p>
            <ul className="flex flex-col gap-2">
              {previewRows.map((cells, rowIndex) => {
                const duplicates = duplicateNames.get(rowIndex);
                return (
                  <li
                    className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm"
                    key={cells.join("|")}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {mapping
                        .map((field, columnIndex) =>
                          field === SKIP_COLUMN ? null : cells[columnIndex]
                        )
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {duplicates && (
                      <Badge variant="destructive">
                        Duplicate of {duplicates.join(", ")}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {kind === "contacts" && duplicateNames.size > 0 && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                checked={importDuplicates}
                className="size-5 accent-blu"
                onChange={(event) => setImportDuplicates(event.target.checked)}
                type="checkbox"
              />
              Import flagged duplicates anyway
            </label>
          )}

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          <Button
            className="h-12 sm:max-w-64"
            disabled={isPending}
            onClick={handleImport}
          >
            {isPending
              ? "Working…"
              : `Import ${data.length} ${kind === "contacts" ? "contacts" : "deals"}`}
          </Button>
        </>
      )}
    </div>
  );
}
