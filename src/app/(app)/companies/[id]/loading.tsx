import {
  SkeletonList,
  SkeletonShell,
  SkeletonStats,
} from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the company page: breadcrumb, name header, the three totals,
// then people and deals lists.
export default function CompanyLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-56" />
      </div>
      <SkeletonStats cards={3} className="grid grid-cols-3 gap-3" />
      <SkeletonList rows={2} />
      <SkeletonList rows={3} />
    </SkeletonShell>
  );
}
