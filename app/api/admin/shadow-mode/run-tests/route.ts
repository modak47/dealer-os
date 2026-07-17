import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { runControlledShadowTests } from "@/lib/controlled-shadow-tests";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const result = await runControlledShadowTests();
    return NextResponse.json(result, { status: result.ready ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to run controlled shadow-mode tests." }, { status: 500 });
  }
}
