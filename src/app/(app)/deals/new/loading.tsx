import { SkeletonForm, SkeletonShell } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the quick-add page: narrow single-column capture form.
export default function QuickAddLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <SkeletonForm fields={6} />
    </SkeletonShell>
  );
}
