import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const [automationJobResult, legacyStatusResult] = await Promise.all([
      supabase
        .from("automation_jobs")
        .select("*")
        .eq("job_name", "opportunity_scanner")
        .maybeSingle(),
      supabase
        .from("scanner_status")
        .select("*")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (automationJobResult.error) console.error(automationJobResult.error);
    if (legacyStatusResult.error) console.error(legacyStatusResult.error);

    const legacyStatus = legacyStatusResult.data ?? null;
    const automationJob = automationJobResult.data ?? null;

    if (!legacyStatus && !automationJob) {
      const message =
        automationJobResult.error?.message ??
        legacyStatusResult.error?.message ??
        "Scanner status not found";

      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      automationJob
        ? {
            ...legacyStatus,
            ...automationJob,
            last_run: automationJob.last_finished ?? automationJob.last_started ?? legacyStatus?.last_run,
          }
        : legacyStatus,
    );
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Failed to load scanner status" },
      { status: 500 }
    );
  }
}
