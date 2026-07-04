"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ContactCard } from "@/components/contact-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { awstDayDiff, formatAudFromCents } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DirectoryPerson {
  companyName: string | null;
  email: string | null;
  id: string;
  lastContactAt: string | null;
  name: string;
  nextFollowUpAt: string | null;
  openDeals: number;
  openValueCents: number;
  ownerName: string | null;
  phone: string | null;
  title: string | null;
  topOpenStage: string | null;
}

export interface DirectoryCompany {
  id: string;
  kind: string | null;
  name: string;
  openValueCents: number;
  peopleCount: number;
}

type QuickFilter = "all" | "open" | "due" | "stale";
type SortKey = "name" | "recent" | "value";
type DirectoryView = "companies" | "people";

const QUICK_FILTERS: { label: string; value: QuickFilter }[] = [
  { label: "All", value: "all" },
  { label: "Open deals", value: "open" },
  { label: "Follow-up due", value: "due" },
  { label: "No touch 30d+", value: "stale" },
];

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Name A–Z", value: "name" },
  { label: "Recently contacted", value: "recent" },
  { label: "Open value", value: "value" },
];

const STALE_AFTER_DAYS = 30;
const SEARCH_DEBOUNCE_MS = 250;

const parseFilter = (value: string | null): QuickFilter =>
  QUICK_FILTERS.some((option) => option.value === value)
    ? (value as QuickFilter)
    : "all";

const parseSort = (value: string | null): SortKey =>
  SORT_OPTIONS.some((option) => option.value === value)
    ? (value as SortKey)
    : "name";

// Shallow URL sync: filters become shareable and survive back-navigation from
// a detail page without a server round-trip per keystroke or pill tap (the
// page is force-dynamic, so router.replace would refetch every time).
const syncUrl = (updates: Record<string, string | null>) => {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const search = params.toString();
  window.history.replaceState(
    null,
    "",
    search ? `?${search}` : window.location.pathname
  );
};

const matchesQuery = (query: string, fields: (string | null)[]): boolean =>
  fields.some((field) => field?.toLowerCase().includes(query));

const matchesFilter = (
  person: DirectoryPerson,
  filter: QuickFilter,
  now: Date
): boolean => {
  switch (filter) {
    case "open":
      return person.openDeals > 0;
    case "due":
      return (
        person.nextFollowUpAt !== null &&
        awstDayDiff(new Date(person.nextFollowUpAt), now) <= 0
      );
    case "stale":
      return (
        person.lastContactAt === null ||
        awstDayDiff(new Date(person.lastContactAt), now) <= -STALE_AFTER_DAYS
      );
    default:
      return true;
  }
};

const comparePeople = (
  a: DirectoryPerson,
  b: DirectoryPerson,
  sort: SortKey
): number => {
  if (sort === "recent") {
    // Most recent first, never-contacted last; ISO strings compare correctly.
    if (a.lastContactAt === b.lastContactAt) {
      return a.name.localeCompare(b.name);
    }
    if (a.lastContactAt === null) {
      return 1;
    }
    if (b.lastContactAt === null) {
      return -1;
    }
    return b.lastContactAt.localeCompare(a.lastContactAt);
  }
  if (sort === "value") {
    return b.openValueCents - a.openValueCents || a.name.localeCompare(b.name);
  }
  // "name": the server already ordered by name; keep it stable.
  return 0;
};

const peopleCountLabel = (count: number): string =>
  count === 1 ? "1 person" : `${count} people`;

const companiesCountLabel = (count: number): string =>
  count === 1 ? "1 company" : `${count} companies`;

// Client-side instant search: the whole book is small enough to filter
// in memory, which keeps lookups under the PRD's 200ms search budget even
// on a phone in the workshop.
export function ContactsDirectory({
  people,
  companies,
}: {
  people: DirectoryPerson[];
  companies: DirectoryCompany[];
}) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [filter, setFilter] = useState<QuickFilter>(() =>
    parseFilter(searchParams.get("filter"))
  );
  const [sort, setSort] = useState<SortKey>(() =>
    parseSort(searchParams.get("sort"))
  );
  const [view, setView] = useState<DirectoryView>(() =>
    searchParams.get("view") === "companies" ? "companies" : "people"
  );
  const skipFirstQuerySync = useRef(true);

  // One timestamp per mount keeps every card's relative-day math consistent.
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    // Don't rewrite the URL on mount — it would drop unrelated params.
    if (skipFirstQuerySync.current) {
      skipFirstQuerySync.current = false;
      return;
    }
    const handle = setTimeout(() => {
      syncUrl({ q: query.trim() });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const needle = query.trim().toLowerCase();
  const filtering = needle !== "" || filter !== "all";

  const visiblePeople = useMemo(() => {
    const matched = people.filter(
      (person) =>
        matchesFilter(person, filter, now) &&
        (needle === "" ||
          matchesQuery(needle, [
            person.name,
            person.companyName,
            person.email,
            person.phone,
            person.title,
          ]))
    );
    return sort === "name"
      ? matched
      : [...matched].sort((a, b) => comparePeople(a, b, sort));
  }, [people, needle, filter, sort, now]);

  const visibleCompanies = useMemo(
    () =>
      needle === ""
        ? companies
        : companies.filter((entry) =>
            matchesQuery(needle, [entry.name, entry.kind])
          ),
    [companies, needle]
  );

  const selectFilter = (value: QuickFilter) => {
    setFilter(value);
    syncUrl({ filter: value === "all" ? null : value });
  };

  const selectSort = (value: SortKey) => {
    setSort(value);
    syncUrl({ sort: value === "name" ? null : value });
  };

  const selectView = (value: DirectoryView) => {
    setView(value);
    syncUrl({ view: value === "people" ? null : value });
  };

  const clearFilters = () => {
    setQuery("");
    setFilter("all");
    setSort("name");
    syncUrl({ q: null, filter: null, sort: null });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Sits below the h-14 mobile app-shell header; desktop has a sidebar
          instead, so the toolbar can hug the top there. */}
      <div className="sticky top-14 z-10 -mx-4 flex flex-col gap-2 bg-background/95 px-4 py-2 backdrop-blur md:top-0">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-3 left-3 size-5 text-muted-foreground"
          />
          <Input
            aria-label="Search contacts"
            className="h-11 pl-10"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people and companies…"
            type="search"
            value={query}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">Filter people</legend>
            {QUICK_FILTERS.map((option) => {
              const active = filter === option.value;
              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-sm transition-colors",
                    active
                      ? "border-blu bg-blu/10 text-blu"
                      : "text-muted-foreground hover:border-foreground/30"
                  )}
                  key={option.value}
                  onClick={() => selectFilter(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </fieldset>
          <NativeSelect
            aria-label="Sort people"
            className="h-9 w-auto min-w-36"
            containerClassName="ml-auto w-auto shrink-0"
            onChange={(event) => selectSort(event.target.value as SortKey)}
            value={sort}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {filtering && (
          <p
            className="text-muted-foreground text-sm tabular-nums"
            role="status"
          >
            {peopleCountLabel(visiblePeople.length)} ·{" "}
            {companiesCountLabel(visibleCompanies.length)} match
          </p>
        )}
      </div>

      <fieldset className="grid grid-cols-2 gap-1 rounded-lg border p-1 lg:hidden">
        <legend className="sr-only">Directory section</legend>
        {(
          [
            { label: `People (${visiblePeople.length})`, value: "people" },
            {
              label: `Companies (${visibleCompanies.length})`,
              value: "companies",
            },
          ] as const
        ).map((option) => {
          const active = view === option.value;
          return (
            <button
              aria-pressed={active}
              className={cn(
                "min-h-10 rounded-md text-sm transition-colors",
                active
                  ? "bg-blu/10 font-medium text-blu"
                  : "text-muted-foreground"
              )}
              key={option.value}
              onClick={() => selectView(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-10">
        <section
          aria-label="People"
          className={cn(
            "flex-col gap-2",
            view === "people" ? "flex" : "hidden lg:flex"
          )}
        >
          <h2 className="font-heading font-medium text-muted-foreground text-sm uppercase tracking-wide">
            People ({visiblePeople.length})
          </h2>
          {visiblePeople.length === 0 &&
            (filtering ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-muted-foreground text-sm">
                  No people match.
                </p>
                <Button onClick={clearFilters} size="sm" variant="outline">
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <p className="text-muted-foreground text-sm">
                  No contacts yet.
                </p>
                <Button
                  nativeButton={false}
                  render={<Link href="/contacts/new">Add contact</Link>}
                  size="sm"
                  variant="outline"
                />
              </div>
            ))}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {visiblePeople.map((person) => (
              <ContactCard key={person.id} now={now} person={person} />
            ))}
          </ul>
        </section>

        <section
          aria-label="Companies"
          className={cn(
            "flex-col gap-2",
            view === "companies" ? "flex" : "hidden lg:flex"
          )}
        >
          <h2 className="font-heading font-medium text-muted-foreground text-sm uppercase tracking-wide">
            Companies ({visibleCompanies.length})
          </h2>
          {visibleCompanies.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {needle ? "No companies match your search." : "No companies yet."}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {visibleCompanies.map((entry) => (
              <li key={entry.id}>
                <Link
                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-blu"
                  href={`/companies/${entry.id}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-sm">
                        {entry.name}
                      </span>
                      {entry.kind && (
                        <Badge className="shrink-0" variant="outline">
                          {entry.kind}
                        </Badge>
                      )}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {peopleCountLabel(entry.peopleCount)}
                    </span>
                  </span>
                  {entry.openValueCents > 0 && (
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatAudFromCents(entry.openValueCents)}
                    </span>
                  )}
                  <ArrowRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
