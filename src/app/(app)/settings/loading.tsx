import {
  SkeletonForm,
  SkeletonHeader,
  SkeletonShell,
} from "@/components/page-skeletons";

const STAGE_COUNT = 8;

// Mirrors the settings page: alert thresholds (two side-by-side fields)
// then a weighting field per pipeline stage.
export default function SettingsLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <SkeletonHeader />
      <SkeletonForm
        fields={2}
        fieldsClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
      />
      <SkeletonForm
        fields={STAGE_COUNT}
        fieldsClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
      />
    </SkeletonShell>
  );
}
