import { NextResponse } from "next/server";
import { submitDraft } from "../../../lib/marketplace";
import { absoluteUrl } from "../../../site";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await submitDraft();
    if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });
    const secureLink = absoluteUrl(`/seller/${result.access.token}`);
    await sendSellerMagicLink(String(result.lead.email ?? ""), secureLink);
    return NextResponse.json({
      reference: `MG-${String(result.lead.id).padStart(6, "0")}`,
      leadId: result.lead.id,
      secureLinkSent: Boolean(process.env.RESEND_API_KEY && result.lead.email),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit valuation." }, { status: 500 });
  }
}

async function sendSellerMagicLink(to: string, secureLink: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.MOTORGEEKS_RESEND_FROM;
  if (!key || !to || !from) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Your MotorGeeks motorcycle profile",
      html: `<div style="font-family:Arial,sans-serif;color:#07182d"><h1>Your motorcycle profile is ready</h1><p>We've emailed you a secure link to view your motorcycle profile, add photos later and check for dealer offers.</p><p><a href="${secureLink}" style="display:inline-block;background:#1186eb;color:white;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">View my profile</a></p><p>This link is private. Do not forward it unless you want someone else to access your seller profile.</p></div>`,
    }),
  }).catch(() => null);
}
