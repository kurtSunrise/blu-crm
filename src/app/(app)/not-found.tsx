import Link from "next/link";
import { Button } from "@/components/ui/button";

// Catches notFound() from the id-fetching routes (deals/[id], contacts/[id],
// companies/[id] and their edit pages) and any unmatched in-shell URL.
export default function AppNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="font-heading font-semibold text-2xl">Record not found</h1>
      <p className="text-muted-foreground text-sm">
        This record does not exist or may have been deleted.
      </p>
      <div className="flex gap-2">
        <Button
          className="h-11"
          nativeButton={false}
          render={<Link href="/pipeline">Go to pipeline</Link>}
        />
        <Button
          className="h-11"
          nativeButton={false}
          render={<Link href="/contacts">Go to contacts</Link>}
          variant="outline"
        />
      </div>
    </div>
  );
}
