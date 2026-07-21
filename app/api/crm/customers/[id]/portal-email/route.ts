import { NextResponse } from "next/server";
import { getDealerSettings } from "@/lib/dealer-settings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  try {
    const [{ data: customer, error }, settings] = await Promise.all([
      db.from("crm_customers").select("id,first_name,last_name,email,portal_access_code").eq("id", id).maybeSingle(),
      getDealerSettings(),
    ]);
    if (error) throw error;
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    if (!customer.email) return NextResponse.json({ error: "This customer does not have an email address." }, { status: 400 });
    if (!customer.portal_access_code) return NextResponse.json({ error: "This customer does not have a portal code yet." }, { status: 400 });

    const key = process.env.RESEND_API_KEY;
    if (!key) return NextResponse.json({ error: "Email provider not configured. Add RESEND_API_KEY in Vercel before sending portal details.", code: "not_configured" }, { status: 503 });

    const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "there";
    const portalUrl = `${settings.website?.replace(/\/$/, "") || process.env.NEXT_PUBLIC_SITE_URL || ""}/portal`;
    const subject = `Your ${settings.business_name || "YesMoto"} customer portal`;
    const plain = `Hi ${name},\n\nYour customer portal is ready.\n\nPortal: ${portalUrl}\nEmail: ${customer.email}\nPortal code: ${customer.portal_access_code}\n\nYou can use this to view your motorcycle status, invoices, payment details and delivery updates.\n\nThank you,\n${settings.business_name}\n${settings.phone}`;
    const fromAddress = process.env.RESEND_FROM_EMAIL || settings.email_from_address || settings.email;
    const from = fromAddress.includes("<") ? fromAddress : `${settings.email_from_name || settings.business_name} <${fromAddress}>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [customer.email], reply_to: settings.email_reply_to || settings.email || undefined, subject, html: `<div style="font-family:Arial,sans-serif;color:#18211d;white-space:pre-line">${escape(plain)}</div>` }),
    });
    const provider = await response.json().catch(() => ({ message: "Invalid provider response" }));
    if (!response.ok) return NextResponse.json({ error: `Portal email failed: ${String((provider as { message?: string }).message ?? response.statusText)}` }, { status: 502 });

    await db.from("crm_communications").insert({ customer_id: customer.id, channel: "Email", direction: "Outbound", subject, body: plain, external_id: String((provider as { id?: string }).id ?? ""), metadata: provider });
    return NextResponse.json({ ok: true, message: "Portal details sent." });
  } catch (error) {
    console.error("Portal email failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send portal details." }, { status: 500 });
  }
}
