"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton(){const router=useRouter();async function logout(){try{await createClient().auth.signOut()}finally{router.replace("/admin");router.refresh()}}return <button onClick={logout} title="Sign out" aria-label="Sign out">↪</button>}
