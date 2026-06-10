import {
  SkeletonHeader,
  SkeletonList,
  SkeletonShell,
  SkeletonStats,
} from "@/components/page-skeletons";

// Mirrors the weekly report: header with the Copy report button, the
// six summary tiles, then the listed report sections.
export default function WeeklyReportLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <SkeletonHeader action />
      <SkeletonStats
        cards={6}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      />
      <SkeletonList rows={3} />
      <SkeletonList rows={3} />
    </SkeletonShell>
  );
}
