import { SkeletonShell } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the tokenised quote view: brand header and the quote card.
export default function QuoteViewLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-11 w-full" />
      </div>
    </SkeletonShell>
  );
}
