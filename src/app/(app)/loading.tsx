import { SkeletonShell, SkeletonStats } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

const MODULE_CARD_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6"];

// Mirrors the home dashboard: brand header, open-pipeline line, four stat
// tiles, then the module card grid.
export default function HomeLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <Skeleton className="mb-2 size-16 rounded-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-64" />
        <SkeletonStats cards={4} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULE_CARD_KEYS.map((key) => (
          <div
            className="flex flex-col gap-2 rounded-lg border bg-card p-6"
            key={key}
          >
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}
