"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_TYPE_LABELS } from "@/lib/labels";
import { PROJECT_TYPES } from "@/lib/validation/deal";

const SELECT_CLASSES =
  "flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm";

// Posts to the write-only public endpoint rather than a server action so the
// form keeps working when embedded cross-origin on blu.builders (FR-3.2).
export function EnquiryForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      [...formData.entries()].filter(([, value]) => value !== "")
    );

    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Something went wrong. Please email info@blu.builders.");
      setStatus("idle");
    }
  };

  if (status === "sent") {
    return (
      <section
        aria-label="Enquiry received"
        className="flex flex-col gap-2 rounded-lg border bg-card p-5"
      >
        <h2 className="font-heading font-semibold text-lg">
          Thanks, we have your enquiry
        </h2>
        <p className="text-muted-foreground text-sm">
          The Blu team will be in touch within one business day. If it is
          urgent, call us on (08) 6285 0231.
        </p>
      </section>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="enquiry-name">Your name *</Label>
          <Input className="h-11" id="enquiry-name" name="name" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="enquiry-company">Company / brand</Label>
          <Input className="h-11" id="enquiry-company" name="company" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="enquiry-email">Email *</Label>
          <Input
            className="h-11"
            id="enquiry-email"
            name="email"
            required
            type="email"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="enquiry-phone">Phone</Label>
          <Input
            className="h-11"
            id="enquiry-phone"
            inputMode="tel"
            name="phone"
            type="tel"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="enquiry-project-type">Project type</Label>
          <select
            className={SELECT_CLASSES}
            defaultValue=""
            id="enquiry-project-type"
            name="projectType"
          >
            <option value="">Not sure yet</option>
            {PROJECT_TYPES.map((value) => (
              <option key={value} value={value}>
                {PROJECT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="enquiry-fixed-date">
            Install / event date (if fixed)
          </Label>
          <Input
            className="h-11"
            id="enquiry-fixed-date"
            name="fixedDate"
            type="date"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="enquiry-message">About the project *</Label>
        <Textarea
          id="enquiry-message"
          name="message"
          placeholder="What are you building, where, and roughly when?"
          required
          rows={4}
        />
      </div>
      {/* Honeypot: hidden from people, tempting to bots (FR-3.2 AC). */}
      <div
        aria-hidden
        className="absolute top-auto -left-[9999px] h-px w-px overflow-hidden"
      >
        <label htmlFor="enquiry-website">Website</label>
        <input
          autoComplete="off"
          id="enquiry-website"
          name="website"
          tabIndex={-1}
          type="text"
        />
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button
        className="h-12 text-base"
        disabled={status === "sending"}
        type="submit"
      >
        {status === "sending" ? "Sending…" : "Send enquiry"}
      </Button>
    </form>
  );
}
