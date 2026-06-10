import { Skeleton } from "@/components/ui/skeleton";

// Building blocks for the per-route loading.tsx skeletons (PRD §9.1): each
// route's loading state mirrors that page's real container and layout so
// navigation never lands on a blank screen or shifts when content arrives.

// Skeleton items are static placeholders that never reorder, so derived
// string keys are stable for their lifetime.
const placeholderKeys = (count: number, prefix: string): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

const DEFAULT_LIST_ROWS = 6;
const DEFAULT_FORM_FIELDS = 5;
const BOARD_COLUMNS = 3;
const BOARD_CARDS_PER_COLUMN = 3;

// `className` must match the target page's <main> classes exactly.
export function SkeletonShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <main aria-busy="true" className={className}>
      <p className="sr-only" role="status">
        Loading…
      </p>
      {children}
    </main>
  );
}

export function SkeletonHeader({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {action && <Skeleton className="h-10 w-28 shrink-0" />}
    </div>
  );
}

export function SkeletonStats({
  cards,
  className = "grid grid-cols-2 gap-3 sm:grid-cols-4",
}: {
  cards: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {placeholderKeys(cards, "stat").map((key) => (
        <div
          className="flex flex-col gap-2 rounded-lg border bg-card p-3"
          key={key}
        >
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

// Round filter pills (owner filter on Tasks, period selector on Reports).
export function SkeletonChips({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {placeholderKeys(count, "chip").map((key) => (
        <Skeleton className="h-9 w-24 rounded-full" key={key} />
      ))}
    </div>
  );
}

export function SkeletonList({
  rows = DEFAULT_LIST_ROWS,
  className = "flex flex-col gap-2",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <ul className={className}>
      {placeholderKeys(rows, "row").map((key) => (
        <li
          className="flex items-center gap-3 rounded-lg border bg-card p-3"
          key={key}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

// Matches the kanban board: snap columns at 85vw on phones, 20rem from sm up.
export function SkeletonBoard() {
  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-4">
      {placeholderKeys(BOARD_COLUMNS, "column").map((columnKey) => (
        <div
          className="flex w-[85vw] shrink-0 flex-col gap-2 rounded-lg border bg-card/50 p-3 sm:w-80"
          key={columnKey}
        >
          <Skeleton className="h-5 w-32" />
          {placeholderKeys(BOARD_CARDS_PER_COLUMN, `${columnKey}-card`).map(
            (cardKey) => (
              <div
                className="flex flex-col gap-2 rounded-md border bg-card p-3"
                key={cardKey}
              >
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}

export function SkeletonForm({
  fields = DEFAULT_FORM_FIELDS,
  fieldsClassName = "flex flex-col gap-4",
}: {
  fields?: number;
  fieldsClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className={fieldsClassName}>
        {placeholderKeys(fields, "field").map((key) => (
          <div className="flex flex-col gap-2" key={key}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-12 w-full sm:max-w-48" />
    </div>
  );
}

// Label/value pairs as on the deal and contact detail pages.
export function SkeletonFacts({ pairs }: { pairs: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {placeholderKeys(pairs, "fact").map((key) => (
        <div className="flex flex-col gap-1.5" key={key}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-40 max-w-full" />
        </div>
      ))}
    </div>
  );
}
