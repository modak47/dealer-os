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
    console.error("Controlled shadow-mode tests failed", error);
    return NextResponse.json(errorDetail(error), { status: 500 });
  }
}

function errorDetail(error: unknown) {
  const candidate = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  return {
    error: typeof candidate.message === "string" ? candidate.message : "Unable to run controlled shadow-mode tests.",
    code: typeof candidate.code === "string" ? candidate.code : null,
    details: typeof candidate.details === "string" ? candidate.details : null,
    hint: typeof candidate.hint === "string" ? candidate.hint : null,
  };
}
