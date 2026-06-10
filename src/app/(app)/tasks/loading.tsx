import {
  SkeletonChips,
  SkeletonList,
  SkeletonShell,
} from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the tasks page: owner filter pills, then the day's tasks beside
// the deal alerts on desktop.
export default function TasksLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-24" />
        <SkeletonChips count={4} />
      </div>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <SkeletonList rows={4} />
        <SkeletonList rows={4} />
      </div>
    </SkeletonShell>
  );
}
