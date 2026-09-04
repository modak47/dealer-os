import "server-only";

import { getCurrentUserId } from "@/lib/current-user";
import { recordDealerPortalAuditEvent } from "@/lib/dealer-portal-audit";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/website-leads";
import type { DealerPortalSession } from "@/lib/dealer-portal";
import { normaliseDealerRole } from "@/lib/dealer-portal";
import type { DealerPortalUser, DealerPortalUserRole, DealerPortalUserSummary } from "@/types/dealer-portal";

type AuthUser = { id: string; email?: string };

export function cleanDealerPortalUserRole(value: unknown): DealerPortalUserRole {
  return normaliseDealerRole(value);
}

export function cleanDealerPortalUserEmail(value: unknown) {
  return cleanText(value, 180)?.toLowerCase() ?? null;
}

export async function listDealerPortalUsersForSession(session: DealerPortalSession): Promise<DealerPortalUserSummary[]> {
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from("dealer_portal_users")
    .select("*")
    .eq("dealer_account_id", session.dealer.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Unable to load dealership users: ${error.message}`);
  const users = (data ?? []) as DealerPortalUser[];
  const emailByUserId = await authEmailMap(users.map(user => user.user_id));
  return users.map(user => ({ ...user, role: cleanDealerPortalUserRole(user.role), email: emailByUserId.get(user.user_id) ?? null }));
}

export async function inviteOrLinkDealerPortalUser(session: DealerPortalSession, email: string, role: DealerPortalUserRole, requestUrl: string) {
  const db = getSupabaseAdminClient();
  let authUser = await findAuthUserByEmail(email);
  let invited = false;
  if (!authUser) {
    const invitedUser = await db.auth.admin.inviteUserByEmail(email, {
      data: { full_name: session.dealer.trading_name, role },
      redirectTo: new URL("/dealer-portal", requestUrl).toString(),
    });
    if (invitedUser.error) throw new Error(`Unable to invite dealer login: ${invitedUser.error.message}`);
    authUser = invitedUser.data.user as AuthUser;
    invited = true;
  }

  await assertSingleDealerAccountForUser(authUser.id, session.dealer.id);
  const currentUserId = await getCurrentUserId();
  const { data, error } = await db.from("dealer_portal_users").upsert({
    dealer_account_id: session.dealer.id,
    user_id: authUser.id,
    role,
    active: true,
    invited_at: new Date().toISOString(),
    updated_by: currentUserId,
    created_by: currentUserId,
  }, { onConflict: "dealer_account_id,user_id" }).select("*").single();
  if (error) throw new Error(`Unable to link dealer login: ${error.message}`);
  await recordDealerPortalAuditEvent({
    eventType: invited ? "dealer_login_invited" : "dealer_login_linked",
    dealerAccountId: session.dealer.id,
    dealerUserId: authUser.id,
    eventData: { email, role, managed_by: session.userId },
  });
  return { portalUser: { ...(data as DealerPortalUser), role: cleanDealerPortalUserRole((data as DealerPortalUser).role), email }, invited };
}

export async function updateDealerPortalUserForSession(session: DealerPortalSession, portalUserId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdminClient();
  const { data: existing, error: existingError } = await db
    .from("dealer_portal_users")
    .select("*")
    .eq("id", portalUserId)
    .eq("dealer_account_id", session.dealer.id)
    .maybeSingle();
  if (existingError) throw new Error(`Unable to load dealership user: ${existingError.message}`);
  if (!existing) return null;

  const current = existing as DealerPortalUser;
  if (current.user_id === session.userId) throw new Error("Ask another Dealer Admin to change your own access.");
  const updates: Record<string, unknown> = { updated_by: session.userId };
  if ("role" in body) updates.role = cleanDealerPortalUserRole(body.role);
  if ("active" in body) updates.active = body.active === true || body.active === "true" || body.active === 1 || body.active === "1";
  const { data, error } = await db
    .from("dealer_portal_users")
    .update(updates)
    .eq("id", current.id)
    .eq("dealer_account_id", session.dealer.id)
    .select("*")
    .single();
  if (error) throw new Error(`Unable to update dealership user: ${error.message}`);
  const emailByUserId = await authEmailMap([current.user_id]);
  const nextRole = "role" in updates ? cleanDealerPortalUserRole(updates.role) : current.role;
  const nextActive = "active" in updates ? updates.active === true : current.active;
  const eventType = current.role !== nextRole ? "dealer_login_role_changed"
    : current.active !== nextActive && nextActive ? "dealer_login_activated"
      : current.active !== nextActive ? "dealer_login_deactivated"
        : "dealer_login_updated";
  await recordDealerPortalAuditEvent({
    eventType,
    dealerAccountId: session.dealer.id,
    dealerUserId: current.user_id,
    eventData: {
      portal_user_id: current.id,
      previous_role: current.role,
      new_role: nextRole,
      previous_active: current.active,
      new_active: nextActive,
      managed_by: session.userId,
    },
  });
  return { ...(data as DealerPortalUser), role: cleanDealerPortalUserRole((data as DealerPortalUser).role), email: emailByUserId.get(current.user_id) ?? null };
}

export async function assertSingleDealerAccountForUser(userId: string, allowedDealerAccountId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("dealer_portal_users")
    .select("dealer_account_id")
    .eq("user_id", userId)
    .eq("active", true);
  if (error) throw new Error(`Unable to verify dealer login ownership: ${error.message}`);
  const otherAccount = (data ?? []).find(row => String(row.dealer_account_id) !== allowedDealerAccountId);
  if (otherAccount) throw new Error("This login is already linked to another dealer account.");
}

async function authEmailMap(userIds: string[]) {
  const wanted = new Set(userIds);
  const emails = new Map<string, string>();
  if (!wanted.size) return emails;
  let page = 1;
  while (page <= 10 && emails.size < wanted.size) {
    const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Unable to load auth users: ${error.message}`);
    for (const user of data.users) {
      if (wanted.has(user.id)) emails.set(user.id, user.email ?? "");
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return emails;
}

export async function findAuthUserByEmail(email: string) {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Unable to search existing auth users: ${error.message}`);
    const match = data.users.find(user => user.email?.toLowerCase() === email);
    if (match) return match as AuthUser;
    if (data.users.length < 1000) return null;
    page += 1;
  }
  return null;
}
