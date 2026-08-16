import { Suspense } from "react";
import type { Metadata } from "next";
import { DealerLogo } from "@/app/components/dealer-logo";
import { LoginForm } from "@/app/admin/login-form";
import { dealership } from "@/config/dealership";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Dealer Portal Login",
  description: "Dealer login for motorcycle buying opportunities.",
};

export default function DealerLoginPage() {
  return <div className="admin-login dealer-login-page"><div><DealerLogo /><p className="admin-kicker">DEALER BUYING PORTAL</p><h1>DEALER LOGIN</h1><p>Sign in to view motorcycle opportunities from {dealership.dealerName}, claim leads and manage outcomes.</p><Suspense fallback={<p>Loading secure login...</p>}><LoginForm configured={isSupabaseConfigured} defaultNext="/dealer-portal" resetNext="/dealer-portal" buttonLabel="Sign in to Dealer Portal" /></Suspense></div></div>;
}
