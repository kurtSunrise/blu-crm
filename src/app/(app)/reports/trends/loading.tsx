import {
  SkeletonChips,
  SkeletonHeader,
  SkeletonList,
  SkeletonShell,
  SkeletonStats,
} from "@/components/page-skeletons";

// Mirrors the trends page: header, nav pills, filters, stat tiles, charts.
export default function TrendsLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <SkeletonHeader />
      <SkeletonChips count={4} />
      <SkeletonStats
        cards={4}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      />
      <SkeletonList rows={2} />
      <SkeletonList rows={3} />
    </SkeletonShell>
  );
}
