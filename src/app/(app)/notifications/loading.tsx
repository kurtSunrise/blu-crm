import {
  SkeletonHeader,
  SkeletonList,
  SkeletonShell,
} from "@/components/page-skeletons";

export default function NotificationsLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 lg:max-w-3xl">
      <SkeletonHeader />
      <SkeletonList />
    </SkeletonShell>
  );
}
