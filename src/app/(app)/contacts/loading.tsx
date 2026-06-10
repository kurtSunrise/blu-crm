import { SkeletonShell } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

const PERSON_CARD_KEYS = ["p1", "p2", "p3", "p4", "p5", "p6"];
const COMPANY_ROW_KEYS = ["c1", "c2", "c3", "c4"];

// Mirrors the contacts page: title with Add contact button, then the
// People card grid beside the Companies column.
export default function ContactsLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {PERSON_CARD_KEYS.map((key) => (
              <div
                className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3"
                key={key}
              >
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44 max-w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
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
