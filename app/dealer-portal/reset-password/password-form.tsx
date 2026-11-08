"use client";

import Link from "next/link";
import { MotorGeeksLogo } from "../v4-live-client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dealerAuthError } from "@/lib/dealer-auth-navigation";
import styles from "@/app/dealer-v4-preview/v4-preview.module.css";

export function DealerPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const { data, error } = await createClient().auth.getUser();
        if (active) setReady(Boolean(data.user) && !error);
      } catch { /* An invalid/expired link stays signed out. */ }
      finally { if (active) setChecking(false); }
    }
    void checkSession();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready) return;
    if (password !== confirm) { setMessage("Passwords do not match."); return; }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      router.replace("/dealer-portal");
      router.refresh();
    } catch (error) {
      setMessage(dealerAuthError(error, "Unable to update your password. Please try again."));
    } finally { setBusy(false); }
  }

  return <main className={`${styles.loginPage} ${styles.passwordPage}`}><section className={styles.loginCard}>
    <MotorGeeksLogo variant="wordmarkDark" />
    <h1>Set your password</h1>
    {checking ? <p role="status">Checking your secure link…</p> : ready ? <form onSubmit={submit}>
      <p>Choose a password for your MotorGeeks dealer login.</p>
      <label className={styles.field}>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>
      <p>Use at least 8 characters.</p>
      <label className={styles.field}>Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={event => setConfirm(event.target.value)} disabled={busy} /></label>
      {message && <p className={styles.errorMessage} role="alert">{message}</p>}
      <button className={styles.orangeButton} disabled={busy}>{busy ? "Updating password…" : "Save password"}</button>
    </form> : <><p role="status">This link has expired or is no longer available. Request a new password email from Dealer Login.</p><Link className={styles.blueButton} href="/dealer-login">Go to Dealer Login</Link></>}
    <Link className={styles.loginNetwork} href="https://motorgeeks.co.uk">Back to MotorGeeks</Link>
  </section></main>;
}
