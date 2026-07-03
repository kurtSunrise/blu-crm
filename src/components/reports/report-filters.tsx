"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { LEAD_SOURCE_LABELS } from "@/lib/labels";
import {
  DEFAULT_REPORT_PERIOD_DAYS,
  REPORT_PERIOD_OPTIONS,
  type ReportOwnerOption,
} from "@/lib/report-filters";
import { cn } from "@/lib/utils";

// Shared filter bar for the report pages. All state lives in the URL (the
// pages are server components keyed on searchParams), so this only merges
// params and navigates — page-specific params (e.g. ?stage on the drill-down)
// pass through untouched.
export function ReportFilters({ owners }: { owners: ReportOwnerOption[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const apply = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const fromKey = searchParams.get("from") ?? "";
  const toKey = searchParams.get("to") ?? "";
  const hasCustomRange = fromKey !== "";
  const activeDays = Number(searchParams.get("days") ?? "");
  const activePeriod = REPORT_PERIOD_OPTIONS.some((o) => o === activeDays)
    ? activeDays
    : DEFAULT_REPORT_PERIOD_DAYS;

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Report period</legend>
        {REPORT_PERIOD_OPTIONS.map((option) => (
          <button
            className={cn(
              "flex min-h-9 items-center rounded-full border px-4 text-sm transition-colors",
              !hasCustomRange && option === activePeriod
                ? "border-blu text-blu"
                : "text-muted-foreground hover:bg-accent"
            )}
            key={option}
            onClick={() =>
              apply({ days: String(option), from: null, to: null })
            }
            type="button"
          >
            Last {option} days
          </button>
        ))}
        <div className="flex items-center gap-2">
          <label className="flex items-center" htmlFor="report-filter-from">
            <span className="sr-only">From date</span>
            <Input
              className="h-9 w-auto"
              id="report-filter-from"
              onChange={(event) =>
                apply({ from: event.target.value || null, days: null })
              }
              type="date"
              value={fromKey}
            />
          </label>
          <span aria-hidden className="text-muted-foreground text-sm">
            –
          </span>
          <label className="flex items-center" htmlFor="report-filter-to">
            <span className="sr-only">To date</span>
            <Input
              className="h-9 w-auto"
              id="report-filter-to"
              onChange={(event) =>
                apply({ to: event.target.value || null, days: null })
              }
              type="date"
              value={toKey}
            />
          </label>
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <label className="flex flex-col" htmlFor="report-filter-owner">
          <span className="sr-only">Owner</span>
          <NativeSelect
            className="h-9"
            id="report-filter-owner"
            onChange={(event) => apply({ owner: event.target.value || null })}
            value={searchParams.get("owner") ?? ""}
          >
            <option value="">All owners</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col" htmlFor="report-filter-source">
          <span className="sr-only">Lead source</span>
          <NativeSelect
            className="h-9"
            id="report-filter-source"
            onChange={(event) => apply({ source: event.target.value || null })}
            value={searchParams.get("source") ?? ""}
          >
            <option value="">All sources</option>
            {Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
    </div>
  );
}
