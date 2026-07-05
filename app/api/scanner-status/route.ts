import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("scanner_status")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      console.error(error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Failed to load scanner status" },
      { status: 500 }
    );
  }
}
