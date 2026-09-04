import { NextResponse } from "next/server";
import { getCurrentDealerPortalAccount, isDealerPortalAdmin } from "@/lib/dealer-portal";
import { updateDealerPortalUserForSession } from "@/lib/dealer-portal-users";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getCurrentDealerPortalAccount();
    if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
    if (!isDealerPortalAdmin(session)) return NextResponse.json({ error: "Dealer Admin access is required to manage dealership users." }, { status: 403 });
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const user = await updateDealerPortalUserForSession(session, id, body);
    if (!user) return NextResponse.json({ error: "Dealership user not found." }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update dealership user." }, { status: 400 });
  }
}
