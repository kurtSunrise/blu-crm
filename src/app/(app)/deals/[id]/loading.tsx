import {
  SkeletonFacts,
  SkeletonList,
  SkeletonShell,
} from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the deal detail page: lead ID, title, badges, then the record on
// the left with the activity timeline alongside on desktop.
export default function DealDetailLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 lg:max-w-6xl">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-11 w-full" />
          <SkeletonFacts pairs={6} />
        </div>
        <SkeletonList rows={4} />
      </div>
    </SkeletonShell>
  );
}
