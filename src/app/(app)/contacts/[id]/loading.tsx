import {
  SkeletonFacts,
  SkeletonList,
  SkeletonShell,
} from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the contact detail page: name header, contact facts, linked deals.
export default function ContactDetailLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <SkeletonFacts pairs={4} />
      <SkeletonList rows={3} />
    </SkeletonShell>
  );
}
