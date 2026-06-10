import { BrandMark } from "@/components/brand-mark";
import { EnquiryForm } from "@/components/enquiry-form";

export const metadata = {
  title: "Start a project | Blu Builders",
  description:
    "Tell us about your fit-out, retail display, event stand, or exhibition build and the Blu team will be in touch.",
};

export default function EnquirePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <BrandMark className="block" priority size={48} />
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          Start a project with Blu
        </h1>
        <p className="text-muted-foreground text-sm">
          Tell us what you are planning and we will come back to you within one
          business day.
        </p>
      </header>
      <EnquiryForm />
      <footer className="text-muted-foreground text-xs">
        Blu.Builders Pty Ltd · Malaga, Western Australia · (08) 6285 0231 ·
        info@blu.builders
      </footer>
    </main>
  );
}
