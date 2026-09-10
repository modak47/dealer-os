import { NextResponse } from "next/server";

const attempts = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const DEFAULT_PURCHASE_FEE = 50;
const DEFAULT_ATTRIBUTION_DAYS = 60;

function clean(value: unknown, max = 800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasConsent(value: unknown) {
  return value === true || value === "on" || value === "true" || value === "1";
}

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateLimited(key: string) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(timestamp => now - timestamp < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > MAX_ATTEMPTS;
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

async function supabaseInsert<T>(table: string, payload: Record<string, unknown>) {
  const config = supabaseConfig();
  if (!config) throw new Error("Dealer application storage is not configured.");
  const response = await fetch(`${config.url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null) as T[] | { message?: string } | null;
  if (!response.ok) {
    const message = data && !Array.isArray(data) && data.message ? data.message : "Supabase insert failed.";
    throw new Error(message);
  }
  return Array.isArray(data) ? data[0] as T : null;
}

async function createPendingDealerApplication(input: { dealership: string; name: string; email: string; telephone: string; postcode: string; website: string; message: string }) {
  const account = await supabaseInsert<{ id: string; trading_name: string; account_status: string }>("dealer_portal_accounts", {
    trading_name: input.dealership,
    main_contact: input.name,
    main_email: input.email,
    telephone: input.telephone,
    postcode: input.postcode,
    website: input.website || null,
    trading_address: input.postcode,
    account_status: "pending",
    successful_purchase_fee: DEFAULT_PURCHASE_FEE,
    attribution_period_days: DEFAULT_ATTRIBUTION_DAYS,
    internal_notes: [
      "Public MotorGeeks dealer application.",
      input.message ? `Applicant message: ${input.message}` : ""
    ].filter(Boolean).join("\n\n")
  });
  if (account?.id) {
    await supabaseInsert("dealer_portal_audit_events", {
      dealer_account_id: account.id,
      event_type: "dealer_application_submitted",
      event_data: {
        source: "motorgeeks_public_dealer_access",
        trading_name: input.dealership,
        applicant_email: input.email
      }
    });
  }
  return account;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const spamTrap = clean(body.companyWebsite, 120);
    const startedAt = Number(body.startedAt);
    const enquiryType = clean(body.enquiryType, 40) === "dealer-access" ? "Dealer access" : "Website contact";
    const name = clean(body.name, 160);
    const email = clean(body.email, 180).toLowerCase();
    const telephone = clean(body.telephone || body.phone, 80);
    const dealership = clean(body.dealership, 180);
    const postcode = clean(body.postcode, 40);
    const website = clean(body.website, 220);
    const message = clean(body.message, 1600);
    const consent = hasConsent(body.consent);

    if (spamTrap) {
      return NextResponse.json({ error: "Unable to send your enquiry. Please try again." }, { status: 400 });
    }

    if (Number.isFinite(startedAt) && Date.now() - startedAt < 1200) {
      return NextResponse.json({ error: "Please wait a moment before sending your enquiry." }, { status: 429 });
    }

    if (rateLimited(clientKey(request))) {
      return NextResponse.json({ error: "Too many enquiries have been sent recently. Please try again later." }, { status: 429 });
    }

    if (!name || !email || !isEmail(email) || !telephone || !consent) {
      return NextResponse.json({ error: "Please provide your name, email, telephone and consent." }, { status: 400 });
    }

    if (enquiryType === "Dealer access" && (!dealership || !postcode)) {
      return NextResponse.json({ error: "Please provide your dealership name and postcode." }, { status: 400 });
    }

    const isDealerAccess = enquiryType === "Dealer access";
    const dealerAccount = isDealerAccess ? await createPendingDealerApplication({ dealership, name, email, telephone, postcode, website, message }) : null;

    const resendKey = process.env.RESEND_API_KEY;
    const to = process.env.MOTORGEEKS_ENQUIRY_RECIPIENT || process.env.MOTORLEADS_ENQUIRY_RECIPIENT;
    const from = process.env.RESEND_FROM_EMAIL || "MotorGeeks <hello@motorgeeks.co.uk>";

    if (!resendKey || !to) {
      if (isDealerAccess && dealerAccount) return NextResponse.json({ ok: true, status: "pending" });
      return NextResponse.json({ error: "MotorGeeks enquiries are not configured yet. Please try again later." }, { status: 503 });
    }

    const lines = [
      `${enquiryType} enquiry`,
      "",
      `Name: ${name}`,
      dealership ? `Dealership: ${dealership}` : "",
      `Email: ${email}`,
      `Telephone: ${telephone}`,
      postcode ? `Postcode: ${postcode}` : "",
      website ? `Website: ${website}` : "",
      dealerAccount?.id ? `Dealer account: ${dealerAccount.id}` : "",
      dealerAccount?.account_status ? `Status: ${dealerAccount.account_status}` : "",
      "",
      "Message:",
      message || "No message supplied."
    ].filter(Boolean);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        reply_to: email,
        subject: `MotorGeeks ${enquiryType} enquiry from ${dealership || name}`,
        text: lines.join("\n")
      })
    });

    if (!response.ok) return NextResponse.json({ error: "Unable to send your enquiry. Please try again." }, { status: 502 });
    return NextResponse.json({ ok: true, status: isDealerAccess ? "pending" : undefined });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send your enquiry. Please try again." }, { status: 400 });
  }
}
