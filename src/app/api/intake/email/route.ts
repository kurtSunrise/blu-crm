import { NextResponse } from "next/server";
import { createLead } from "@/lib/intake";
import { emailIntakeSchema } from "@/lib/validation/intake";

// Email-to-lead intake (FR-3.3): the forwarding hop (Cloudflare Email
// Worker or Power Automate on info@blu.builders) posts the parsed message
// here. AI field extraction arrives with M4; until then every email becomes
// a raw lead in the Inbox with the body attached, so no enquiry is ever
// silently dropped (FR-3.3 AC).

const MAX_TITLE_LENGTH = 120;

export async function POST(request: Request): Promise<NextResponse> {
  const intakeToken = process.env.EMAIL_INTAKE_TOKEN;
  if (!intakeToken) {
    return NextResponse.json(
      { error: "Email intake is not configured (EMAIL_INTAKE_TOKEN unset)" },
      { status: 503 }
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${intakeToken}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = emailIntakeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid email payload" },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const sender = input.fromName ?? input.from;
  const title = `${sender} - ${input.subject}`.slice(0, MAX_TITLE_LENGTH);

  const dealId = await createLead({
    contactName: input.fromName,
    contactEmail: input.from,
    scopeSummary: input.subject,
    source: "other",
    title,
    rawNote: input.body
      ? `Forwarded enquiry email:\n\n${input.body}`
      : `Forwarded enquiry email with subject: ${input.subject}`,
  });

  if (!dealId) {
    return NextResponse.json(
      { error: "Failed to create the lead" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
