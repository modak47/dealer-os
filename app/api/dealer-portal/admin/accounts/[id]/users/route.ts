import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/website-leads";

export const dynamic = "force-dynamic";

type AuthUser = { id: string; email?: string };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const email = cleanText(body.email, 180)?.toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "dealer_admin" ? "dealer_admin" : "dealer_user";
    if (!email) return NextResponse.json({ error: "Dealer login email is required." }, { status: 400 });
    if (password && password.length < 8) return NextResponse.json({ error: "Temporary password must be at least 8 characters." }, { status: 400 });
    const db = getSupabaseAdminClient();
    const account = await db.from("dealer_portal_accounts").select("id,trading_name").eq("id", id).maybeSingle();
    if (account.error) return NextResponse.json({ error: "Unable to load dealer account." }, { status: 500 });
    if (!account.data) return NextResponse.json({ error: "Dealer account not found." }, { status: 404 });

    let authUser = await findAuthUserByEmail(email);
    let created = false;
    if (!authUser) {
      if (!password) return NextResponse.json({ error: "Enter a temporary password for a new dealer login." }, { status: 400 });
      const createdUser = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: account.data.trading_name, role },
      });
      if (createdUser.error) return NextResponse.json({ error: `Unable to create dealer login: ${createdUser.error.message}` }, { status: 500 });
      authUser = createdUser.data.user as AuthUser;
      created = true;
    }

    const staffUserId = await getCurrentUserId();
    const { data, error } = await db.from("dealer_portal_users").upsert({
      dealer_account_id: id,
      user_id: authUser.id,
      role,
      active: true,
      invited_at: new Date().toISOString(),
      created_by: staffUserId,
      updated_by: staffUserId,
    }, { onConflict: "dealer_account_id,user_id" }).select("*").single();
    if (error) return NextResponse.json({ error: `Unable to link dealer login: ${error.message}` }, { status: 500 });
    await db.from("dealer_portal_audit_events").insert({
      dealer_account_id: id,
      dealer_user_id: authUser.id,
      event_type: created ? "dealer_login_created" : "dealer_login_linked",
      event_data: { email, role, linked_by: staffUserId },
    });
    return NextResponse.json({ portalUser: data, authUser: { id: authUser.id, email }, created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create dealer login." }, { status: 400 });
  }
}

async function findAuthUserByEmail(email: string) {
  const db = getSupabaseAdminClient();
  let page = 1;
  while (page <= 10) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Unable to search existing auth users: ${error.message}`);
    const match = data.users.find(user => user.email?.toLowerCase() === email);
    if (match) return match as AuthUser;
    if (data.users.length < 1000) return null;
    page += 1;
  }
  return null;
}
