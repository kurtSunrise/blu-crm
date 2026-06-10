import {
  SkeletonForm,
  SkeletonHeader,
  SkeletonList,
  SkeletonShell,
} from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

const STAGE_COUNT = 8;

// Mirrors the settings page: a two-column card layout with the stage
// manager list, a weighting field per pipeline stage, the alert thresholds
// form, and the lead intake / data / appearance / workspace cards.
function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="size-9 shrink-0 rounded-md" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
      </div>
      {children}
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <SkeletonShell className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-6xl">
      <SkeletonHeader />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <CardShell>
            <SkeletonList rows={STAGE_COUNT} />
          </CardShell>
          <CardShell>
            <SkeletonForm
              fields={STAGE_COUNT}
              fieldsClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
            />
          </CardShell>
          <CardShell>
            <SkeletonForm
              fields={2}
              fieldsClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
            />
          </CardShell>
        </div>
        <div className="flex flex-col gap-6">
          <CardShell>
            <SkeletonList rows={2} />
          </CardShell>
          <CardShell>
            <SkeletonList rows={1} />
          </CardShell>
          <CardShell>
            <Skeleton className="h-12 w-full" />
          </CardShell>
        </div>
      </div>
    </SkeletonShell>
  );
}
