import { NextResponse } from "next/server";
import { dollarsToCents } from "@/lib/format";
import { createLead } from "@/lib/intake";
import { webEnquirySchema } from "@/lib/validation/intake";

// Public web enquiry endpoint (FR-3.2): write-only, rate-limited, and
// spam-protected. Only POST is exported, so reads are 405 by construction.

const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 5;

// Overridable so parallel E2E runs from one IP don't trip it (.env.local).
const rateLimitMax = (): number => {
  const configured = Number(process.env.ENQUIRY_RATE_LIMIT);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_RATE_LIMIT_MAX_REQUESTS;
};

// Best-effort per-isolate limiter; enough to blunt naive abuse alongside the
// honeypot. Durable rate limiting can move to Cloudflare if it proves thin.
const requestLog = new Map<string, number[]>();

const isRateLimited = (clientKey: string): boolean => {
  const now = Date.now();
  const recent = (requestLog.get(clientKey) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
  );
  recent.push(now);
  requestLog.set(clientKey, recent);
  return recent.length > rateLimitMax();
};

export async function POST(request: Request): Promise<NextResponse> {
  const clientKey =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "unknown";
  if (isRateLimited(clientKey)) {
    return NextResponse.json(
      { error: "Too many enquiries. Please try again shortly." },
      { status: 429 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = webEnquirySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid enquiry" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Honeypot tripped: report success so bots learn nothing, store nothing.
  if (input.website) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const dealId = await createLead({
    companyName: input.company,
    contactName: input.name,
    contactEmail: input.email,
    contactPhone: input.phone,
    projectType: input.projectType,
    scopeSummary: input.message,
    estimatedValueCents: input.budgetDollars
      ? dollarsToCents(input.budgetDollars)
      : undefined,
    fixedDate: input.fixedDate,
    source: "web",
  });

  if (!dealId) {
    return NextResponse.json(
      { error: "Something went wrong. Please email info@blu.builders." },
      { status: 500 }
    );
  }

  // Write-only surface: the id stays server-side (FR-3.2 AC).
  return NextResponse.json({ ok: true }, { status: 201 });
}
