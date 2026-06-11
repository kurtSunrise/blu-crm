import {
  SkeletonFacts,
  SkeletonList,
  SkeletonShell,
} from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

const QUICK_ACTION_KEYS = ["call", "text", "email", "edit"];

// Mirrors the contact detail page: breadcrumb, name header with quick
// actions, then deals/quotes/history beside the details column.
export default function ContactDetailLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 lg:max-w-6xl">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTION_KEYS.map((key) => (
            <Skeleton className="h-11 w-24" key={key} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-10">
        <SkeletonList rows={4} />
        <SkeletonFacts pairs={4} />
      </div>
    </SkeletonShell>
  );
}
