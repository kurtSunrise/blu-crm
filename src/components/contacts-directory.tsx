"use client";

import { ArrowRight, Mail, Phone, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatAudFromCents } from "@/lib/format";

export interface DirectoryPerson {
  companyName: string | null;
  email: string | null;
  id: string;
  name: string;
  openDeals: number;
  openValueCents: number;
  phone: string | null;
  title: string | null;
}

export interface DirectoryCompany {
  id: string;
  kind: string | null;
  name: string;
  openValueCents: number;
  peopleCount: number;
}

const matchesQuery = (query: string, fields: (string | null)[]): boolean =>
  fields.some((field) => field?.toLowerCase().includes(query));

const peopleCountLabel = (count: number): string =>
  count === 1 ? "1 person" : `${count} people`;

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
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const visiblePeople = needle
    ? people.filter((person) =>
        matchesQuery(needle, [
          person.name,
          person.companyName,
          person.email,
          person.phone,
          person.title,
        ])
      )
    : people;
  const visibleCompanies = needle
    ? companies.filter((entry) =>
        matchesQuery(needle, [entry.name, entry.kind])
      )
    : companies;

  return (
    <div className="flex flex-col gap-6">
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

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-10">
        <section aria-label="People" className="flex flex-col gap-2">
          <h2 className="font-heading font-medium text-muted-foreground text-sm uppercase tracking-wide">
            People ({visiblePeople.length})
          </h2>
          {visiblePeople.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {needle ? "No people match your search." : "No contacts yet."}
            </p>
          )}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {visiblePeople.map((person) => (
              <li
                className="flex items-center gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-blu"
                key={person.id}
              >
                <Link
                  className="min-w-0 flex-1"
                  href={`/contacts/${person.id}`}
                >
                  <p className="truncate font-medium text-sm">{person.name}</p>
                  <p className="truncate text-muted-foreground text-xs">
                    {[person.title, person.companyName]
                      .filter(Boolean)
                      .join(" · ") ||
                      [person.email, person.phone].filter(Boolean).join(" · ")}
                  </p>
                  {person.openDeals > 0 && (
                    <Badge className="mt-1" variant="secondary">
                      {person.openDeals} open ·{" "}
                      {formatAudFromCents(person.openValueCents)}
                    </Badge>
                  )}
                </Link>
                {person.phone && (
                  <a
                    aria-label={`Call ${person.name}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-md border text-blu transition-colors hover:border-blu"
                    href={`tel:${person.phone}`}
                  >
                    <Phone aria-hidden className="size-4.5" />
                  </a>
                )}
                {person.email && (
                  <a
                    aria-label={`Email ${person.name}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-md border text-blu transition-colors hover:border-blu"
                    href={`mailto:${person.email}`}
                  >
                    <Mail aria-hidden className="size-4.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Companies" className="flex flex-col gap-2">
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
                    <span className="block truncate font-medium text-sm">
                      {entry.name}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {[entry.kind, peopleCountLabel(entry.peopleCount)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {entry.openValueCents > 0 && (
                    <span className="shrink-0 text-sm">
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
