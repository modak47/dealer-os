import { Suspense } from "react";
import { dealership } from "@/config/dealership";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginForm } from "./login-form";
import { DealerLogo } from "@/app/components/dealer-logo";

export default function Admin(){return <div className="admin-login"><div><DealerLogo/><p className="admin-kicker">SECURE DEALEROS ACCESS</p><h1>WELCOME BACK</h1><p>Secure staff access for {dealership.dealerName}. Sign in to manage stock, customers and sales channels.</p><Suspense fallback={<p>Loading secure login…</p>}><LoginForm configured={isSupabaseConfigured}/></Suspense></div></div>}
