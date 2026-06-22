import {
  SkeletonHeader,
  SkeletonList,
  SkeletonShell,
} from "@/components/page-skeletons";

// Mirrors the daily status page: header with day-navigation controls, then a
// stack of per-deal activity cards.
export default function DailyReportLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 lg:max-w-5xl">
      <SkeletonHeader action />
      <SkeletonList rows={4} />
    </SkeletonShell>
  );
}
