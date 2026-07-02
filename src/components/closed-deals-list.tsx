"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DealValueDisplay } from "@/components/deal-value-display";
import { formatAudFromCents, formatDateAwst, MS_PER_DAY } from "@/lib/format";
import { LOST_REASON_LABELS, type LostReason } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface ClosedDeal {
  closedAt: string | null;
  companyName: string | null;
  id: string;
  leadId: string;
  lostReason: string | null;
  outcome: "won" | "lost";
  ownerName: string | null;
  title: string;
  valueCents: number;
  valueRange: { maxCents: number; minCents: number } | null;
}

type OutcomeFilter = "all" | "won" | "lost";

const OUTCOME_FILTERS: { label: string; value: OutcomeFilter }[] = [
  { label: "All", value: "all" },
  { label: "Won", value: "won" },
  { label: "Lost / Dormant", value: "lost" },
];

const ALL_OWNERS = "all";

// Closed deals accumulate forever, so the default view is recent; "All time" is
// available for full historical reporting.
const DATE_PRESETS = [
  { days: 30, label: "Last 30 days", value: "30" },
  { days: 90, label: "Last 90 days", value: "90" },
  { days: 365, label: "Last 12 months", value: "365" },
  { days: null, label: "All time", value: "all" },
] as const;

const DEFAULT_DATE_PRESET = "90";

const lostReasonLabel = (reason: string | null): string | null => {
  if (!reason) {
    return null;
  }
  return LOST_REASON_LABELS[reason as LostReason] ?? reason;
};

const matchesOutcome = (item: ClosedDeal, outcome: OutcomeFilter): boolean =>
  outcome === "all" || item.outcome === outcome;

const matchesOwner = (item: ClosedDeal, owner: string): boolean =>
  owner === ALL_OWNERS || item.ownerName === owner;

const matchesCutoff = (item: ClosedDeal, cutoff: number | null): boolean =>
  cutoff === null ||
  (item.closedAt !== null && new Date(item.closedAt).getTime() >= cutoff);

const matchesQuery = (item: ClosedDeal, query: string): boolean => {
  if (query === "") {
    return true;
  }
  const haystack =
    `${item.title} ${item.companyName ?? ""} ${item.leadId}`.toLowerCase();
  return haystack.includes(query);
};

export function ClosedDealsList({
  deals,
  initialOutcome,
}: {
  deals: ClosedDeal[];
  initialOutcome: OutcomeFilter;
}) {
  const [outcome, setOutcome] = useState<OutcomeFilter>(initialOutcome);
  const [owner, setOwner] = useState<string>(ALL_OWNERS);
  const [datePreset, setDatePreset] = useState<string>(DEFAULT_DATE_PRESET);
  const [search, setSearch] = useState("");

  const owners = useMemo(() => {
    const names = new Set<string>();
    for (const item of deals) {
      if (item.ownerName) {
        names.add(item.ownerName);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [deals]);

  const filtered = useMemo(() => {
    const preset = DATE_PRESETS.find((item) => item.value === datePreset);
    const cutoff =
      preset && preset.days !== null
        ? Date.now() - preset.days * MS_PER_DAY
        : null;
    const query = search.trim().toLowerCase();

    return deals.filter(
      (item) =>
        matchesOutcome(item, outcome) &&
        matchesOwner(item, owner) &&
        matchesCutoff(item, cutoff) &&
        matchesQuery(item, query)
    );
  }, [deals, outcome, owner, datePreset, search]);

  const wonTotalCents = filtered
    .filter((item) => item.outcome === "won")
    .reduce((sum, item) => sum + item.valueCents, 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4">
      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex flex-wrap items-center gap-1">
          <legend className="sr-only">Filter by outcome</legend>
          {OUTCOME_FILTERS.map((option) => {
            const active = outcome === option.value;
            return (
              <button
                aria-pressed={active}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-sm transition-colors",
                  active
                    ? "border-blu bg-blu/10 text-blu"
                    : "text-muted-foreground hover:border-foreground/30"
                )}
                key={option.value}
                onClick={() => setOutcome(option.value)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </fieldset>

        {owners.length > 0 && (
          <label className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <span className="sr-only">Filter by owner</span>
            <select
              className="min-h-9 rounded-md border bg-background px-2 text-foreground text-sm"
              onChange={(event) => setOwner(event.target.value)}
              value={owner}
            >
              <option value={ALL_OWNERS}>All owners</option>
              {owners.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <span className="sr-only">Filter by close date</span>
          <select
            className="min-h-9 rounded-md border bg-background px-2 text-foreground text-sm"
            onChange={(event) => setDatePreset(event.target.value)}
            value={datePreset}
          >
            {DATE_PRESETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ml-auto flex min-w-40 flex-1 items-center gap-1.5 sm:flex-none">
          <span className="sr-only">Search closed deals</span>
          <input
            className="min-h-9 w-full rounded-md border bg-background px-3 text-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, client, or ID"
            type="search"
            value={search}
          />
        </label>
      </div>

      <p className="text-muted-foreground text-sm tabular-nums">
        {filtered.length} {filtered.length === 1 ? "deal" : "deals"}
        {wonTotalCents > 0 && <> · {formatAudFromCents(wonTotalCents)} won</>}
      </p>

      {filtered.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
          No closed deals match these filters.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((item) => (
            <li key={item.id}>
              <Link
                className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-shadow hover:shadow-md"
                href={`/deals/${item.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-muted-foreground text-xs">
                    {item.leadId}
                  </p>
                  <h2 className="truncate font-medium text-sm">{item.title}</h2>
                  <p className="truncate text-muted-foreground text-xs">
                    {item.companyName ?? "No company"}
                    {item.ownerName ? ` · ${item.ownerName.split(" ")[0]}` : ""}
                    {item.closedAt
                      ? ` · ${formatDateAwst(new Date(item.closedAt))}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-medium text-xs",
                      item.outcome === "won"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    )}
                  >
                    {item.outcome === "won" ? "Won" : "Lost"}
                  </span>
                  {item.outcome === "won" && (
                    <DealValueDisplay
                      className="tabular-nums"
                      valueCents={item.valueCents}
                      valueRange={item.valueRange}
                    />
                  )}
                  {item.outcome === "lost" &&
                    lostReasonLabel(item.lostReason) && (
                      <span className="text-muted-foreground text-xs">
                        {lostReasonLabel(item.lostReason)}
                      </span>
                    )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
