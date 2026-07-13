import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

// Proxy for the free ABR (Australian Business Register) JSON web services, so
// the company form can fill the ABN and registered entity name. Session-gated
// read-only lookup; the ABR_GUID registration key stays server-side. The ABR
// endpoints only speak JSONP (`callback({...})`), hence the unwrap below.

const ABN_DIGITS = /^\d{11}$/;
const MAX_QUERY_LENGTH = 200;
const MAX_MATCHES = 5;

interface AbnMatch {
  abn: string;
  name: string;
  postcode: string | null;
  state: string | null;
}

const parseJsonp = (text: string): unknown => {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start === -1 || end <= start) {
    throw new Error("Unexpected ABR response shape");
  }
  return JSON.parse(text.slice(start + 1, end));
};

interface AbrDetailsPayload {
  Abn?: string;
  AddressPostcode?: string;
  AddressState?: string;
  EntityName?: string;
  Message?: string;
}

interface AbrNamesPayload {
  Message?: string;
  Names?: {
    Abn?: string;
    Name?: string;
    Postcode?: string;
    State?: string;
  }[];
}

const lookupByAbn = async (abn: string, guid: string): Promise<AbnMatch[]> => {
  const response = await fetch(
    `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&guid=${encodeURIComponent(guid)}`
  );
  if (!response.ok) {
    throw new Error(`ABR details lookup failed (${response.status})`);
  }
  const payload = parseJsonp(await response.text()) as AbrDetailsPayload;
  if (!(payload.Abn && payload.EntityName)) {
    return [];
  }
  return [
    {
      abn: payload.Abn,
      name: payload.EntityName,
      postcode: payload.AddressPostcode || null,
      state: payload.AddressState || null,
    },
  ];
};

const lookupByName = async (
  name: string,
  guid: string
): Promise<AbnMatch[]> => {
  const response = await fetch(
    `https://abr.business.gov.au/json/MatchingNames.aspx?name=${encodeURIComponent(name)}&maxResults=${MAX_MATCHES}&guid=${encodeURIComponent(guid)}`
  );
  if (!response.ok) {
    throw new Error(`ABR name search failed (${response.status})`);
  }
  const payload = parseJsonp(await response.text()) as AbrNamesPayload;
  return (payload.Names ?? []).flatMap((entry) =>
    entry.Abn && entry.Name
      ? [
          {
            abn: entry.Abn,
            name: entry.Name,
            postcode: entry.Postcode || null,
            state: entry.State || null,
          },
        ]
      : []
  );
};

export async function GET(request: Request): Promise<NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guid = process.env.ABR_GUID;
  if (!guid) {
    return NextResponse.json(
      { error: "ABN lookup is not configured (ABR_GUID unset)" },
      { status: 503 }
    );
  }

  const raw = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (raw.length < 2 || raw.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: "Enter an ABN or a company name to search" },
      { status: 400 }
    );
  }

  const digits = raw.replaceAll(" ", "");
  try {
    const matches = ABN_DIGITS.test(digits)
      ? await lookupByAbn(digits, guid)
      : await lookupByName(raw, guid);
    return NextResponse.json(
      { matches },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    console.error("[abn-lookup]", error);
    return NextResponse.json(
      { error: "The ABN register is not responding; try again shortly" },
      { status: 502 }
    );
  }
}
