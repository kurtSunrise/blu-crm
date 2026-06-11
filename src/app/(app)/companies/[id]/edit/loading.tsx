import {
  SkeletonForm,
  SkeletonHeader,
  SkeletonShell,
} from "@/components/page-skeletons";

// Mirrors the edit company page: title then the four-field form.
export default function EditCompanyLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      <SkeletonHeader />
      <SkeletonForm fields={4} />
    </SkeletonShell>
  );
}
