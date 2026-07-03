import {
  SkeletonChips,
  SkeletonHeader,
  SkeletonList,
  SkeletonShell,
} from "@/components/page-skeletons";

// Mirrors the drill-down list: back link + heading, filter bar, deal rows.
export default function ReportDealsLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <SkeletonHeader />
      <SkeletonChips count={4} />
      <SkeletonList rows={8} />
    </SkeletonShell>
  );
}
