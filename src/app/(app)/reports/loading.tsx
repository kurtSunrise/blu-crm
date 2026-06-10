import {
  SkeletonChips,
  SkeletonHeader,
  SkeletonList,
  SkeletonShell,
  SkeletonStats,
} from "@/components/page-skeletons";

// Mirrors the reports dashboard: header with the Weekly report button,
// overview tiles, stage rows, the period pills, then win rate and activity.
export default function ReportsLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <SkeletonHeader action />
      <SkeletonStats
        cards={3}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      />
      <SkeletonList />
      <SkeletonChips count={3} />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <SkeletonStats
          cards={4}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2"
        />
        <SkeletonList rows={3} />
      </div>
    </SkeletonShell>
  );
}
