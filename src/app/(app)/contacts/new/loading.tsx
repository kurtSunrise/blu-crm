import {
  SkeletonForm,
  SkeletonHeader,
  SkeletonShell,
} from "@/components/page-skeletons";

// Mirrors the add contact page: title then the five-field form.
export default function NewContactLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      <SkeletonHeader />
      <SkeletonForm fields={5} />
    </SkeletonShell>
  );
}
