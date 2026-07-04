import { SkeletonShell } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

const PERSON_CARD_KEYS = ["p1", "p2", "p3", "p4", "p5", "p6"];
const COMPANY_ROW_KEYS = ["c1", "c2", "c3", "c4"];
const FILTER_PILL_KEYS = ["f1", "f2", "f3", "f4"];

// Mirrors the contacts page: brand header with actions, the sticky toolbar
// (search, filter pills, sort), then the People card grid beside the
// Companies column.
export default function ContactsLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 w-28" />
        </div>
      </div>
      <div className="flex flex-col gap-2 py-2">
        <Skeleton className="h-11 w-full" />
        <div className="flex items-center gap-1">
          {FILTER_PILL_KEYS.map((key) => (
            <Skeleton className="h-9 w-20 rounded-full" key={key} />
          ))}
          <Skeleton className="ml-auto h-9 w-36" />
        </div>
      </div>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {PERSON_CARD_KEYS.map((key) => (
              <div
                className="flex items-center gap-2 rounded-lg border bg-card p-3"
                key={key}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-44 max-w-full" />
                    <Skeleton className="h-3 w-36 max-w-full" />
                  </div>
                </div>
                <Skeleton className="size-11 shrink-0" />
                <Skeleton className="size-11 shrink-0" />
                <Skeleton className="size-11 shrink-0" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <div className="flex flex-col gap-2">
            {COMPANY_ROW_KEYS.map((key) => (
              <div
                className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3"
                key={key}
              >
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}
