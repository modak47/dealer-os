-- Supabase Advisor: avoid SECURITY DEFINER behaviour on the shadow health view.
-- The view is read-only and should use the caller's permissions/RLS.

alter view if exists public.dealer5_shadow_health
set (security_invoker = true);
