import { SkeletonBoard, SkeletonShell } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the pipeline page: full-bleed board under a constrained header.
export default function PipelineLoading() {
  return (
    <SkeletonShell className="flex h-full flex-col gap-4 py-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4">
        <Skeleton className="h-8 w-32" />
      </div>
      <SkeletonBoard />
    </SkeletonShell>
  );
}
