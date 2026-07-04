import {
  SkeletonChips,
  SkeletonHeader,
  SkeletonList,
  SkeletonShell,
} from "@/components/page-skeletons";

// Mirrors the funnel page: header, nav pills, filters, funnel bars, velocity.
export default function FunnelLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <SkeletonHeader />
      <SkeletonChips count={5} />
      <SkeletonList rows={6} />
      <SkeletonList rows={5} />
    </SkeletonShell>
  );
}
