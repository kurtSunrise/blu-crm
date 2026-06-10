import {
  SkeletonForm,
  SkeletonHeader,
  SkeletonShell,
} from "@/components/page-skeletons";

export default function ImportLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <SkeletonHeader />
      <SkeletonForm fields={2} />
    </SkeletonShell>
  );
}
