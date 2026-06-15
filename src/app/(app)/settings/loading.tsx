import { SkeletonForm, SkeletonList } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

const STAGE_COUNT = 8;

// Fills the settings content column while a tab loads. The shell heading and
// sub-nav come from the layout, so this only mirrors the section blocks: an
// icon tile with a title/description, then a bordered card.
function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Skeleton className="size-9 shrink-0 rounded-md" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
      </div>
      <div className="rounded-lg border bg-card p-4 sm:p-5">{children}</div>
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <SectionShell>
        <SkeletonList rows={STAGE_COUNT} />
      </SectionShell>
      <SectionShell>
        <SkeletonForm
          fields={2}
          fieldsClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
        />
      </SectionShell>
      <SectionShell>
        <Skeleton className="h-12 w-full" />
      </SectionShell>
    </div>
  );
}
