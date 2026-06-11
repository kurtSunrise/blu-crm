import {
  SkeletonForm,
  SkeletonHeader,
  SkeletonShell,
} from "@/components/page-skeletons";

// Mirrors the edit contact page: title then the six-field form.
export default function EditContactLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      <SkeletonHeader />
      <SkeletonForm fields={6} />
    </SkeletonShell>
  );
}
