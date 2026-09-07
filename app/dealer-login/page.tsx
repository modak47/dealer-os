import { Suspense } from "react";
import type { Metadata } from "next";
import { DealerLoginV4Live } from "@/app/dealer-portal/v4-live-client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Dealer Portal Login",
  description: "Dealer login for motorcycle buying opportunities.",
};

export default function DealerLoginPage() {
  return <Suspense fallback={<p>Loading secure login...</p>}><DealerLoginV4Live configured={isSupabaseConfigured} /></Suspense>;
}
