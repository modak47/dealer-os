import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { purgeControlledShadowTestData } from "@/lib/controlled-shadow-tests";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const result = await purgeControlledShadowTestData();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Shadow-mode test cleanup failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to clear shadow-mode test data." }, { status: 500 });
  }
}
