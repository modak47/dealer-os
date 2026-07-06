"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({configured}:{configured:boolean}){
  const router=useRouter();
  const searchParams=useSearchParams();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [rememberEmail,setRememberEmail]=useState(true);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{const saved=window.localStorage.getItem("dealeros-login-email");if(saved)setEmail(saved)},[]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!configured){setError("Add the Supabase environment variables before signing in.");return}
    setLoading(true);setError("");
    try{
      const supabase=createClient();
      const cleanEmail=email.trim();
      const {error:authError}=await supabase.auth.signInWithPassword({email:cleanEmail,password});
      if(authError)throw authError;
      if(rememberEmail)window.localStorage.setItem("dealeros-login-email",cleanEmail);else window.localStorage.removeItem("dealeros-login-email");
      const next=searchParams.get("next");
      router.replace(next?.startsWith("/admin/")?next:"/admin/dashboard");
      router.refresh();
    }catch(caught){setError(caught instanceof Error?caught.message:"Sign in failed.")}
    finally{setLoading(false)}
  }

  async function resetPassword(){
    if(!configured||!email.trim()){setError("Enter your email address first.");return}
    setLoading(true);setError("");
    const supabase=createClient();
    const {error:resetError}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/auth/callback?next=/admin/reset-password`});
    setLoading(false);setError(resetError?resetError.message:"Password reset email sent.");
  }

  return <form onSubmit={submit}>
    <label>Email address<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required disabled={!configured||loading}/></label>
    <label>Password<input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" required disabled={!configured||loading}/></label>
    <label className="remember-login"><input type="checkbox" checked={rememberEmail} onChange={event=>setRememberEmail(event.target.checked)} disabled={loading}/><span>Remember my email on this device</span></label>
    {error&&<p className={error.includes("sent")?"auth-message success":"auth-message"}>{error}</p>}
    <button type="submit" className="btn green" disabled={!configured||loading}>{loading?"Signing in…":"Sign in to DealerOS"}</button>
    <button type="button" className="forgot-password" onClick={resetPassword} disabled={!configured||loading}>Forgot password?</button>
    {!configured&&<small className="auth-setup">Authentication setup required: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.</small>}
  </form>;
}
