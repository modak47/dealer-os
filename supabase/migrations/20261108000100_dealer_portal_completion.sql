begin;

-- Serialize membership activation for both the person and target dealership.
-- Existing memberships are preserved; no historical rows are rewritten.
create or replace function public.enforce_dealer_portal_membership_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not new.active then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dealer-portal-user:' || new.user_id::text, 0));
  perform 1 from public.dealer_portal_accounts where id = new.dealer_account_id for update;
  if exists(select 1 from public.dealer_portal_users where user_id = new.user_id and active and dealer_account_id <> new.dealer_account_id and id <> new.id) then
    raise exception 'This login is already linked to another dealer account.' using errcode = '23514';
  end if;
  -- BEFORE INSERT also runs before an ON CONFLICT update. Exclude the same
  -- login, not just the incoming row ID, so re-inviting an existing user works.
  if (select count(*) from public.dealer_portal_users where dealer_account_id = new.dealer_account_id and active and id <> new.id and user_id <> new.user_id) >= 4 then
    raise exception 'Dealer Portal accounts are limited to one main account and three additional users.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_dealer_portal_membership_limit() from public, anon, authenticated;
drop trigger if exists dealer_portal_membership_limit on public.dealer_portal_users;
create trigger dealer_portal_membership_limit before insert or update of active, dealer_account_id, user_id
on public.dealer_portal_users for each row execute function public.enforce_dealer_portal_membership_limit();

-- A failed accepted sale closes the marketplace profile without making a fee,
-- reopening bids or sending the seller's details to a different dealership.
create or replace function public.dealer_update_marketplace_claim(
  p_claim_id uuid, p_dealer_account_id uuid, p_dealer_user_id uuid,
  p_status text, p_lost_reason text default null, p_lost_reason_detail text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_claim public.dealer_lead_claims;
  v_lead public.website_leads;
  v_terminal boolean := p_status in ('lost', 'returned_to_pool');
  v_now timestamptz := now();
begin
  if p_status not in ('agreed_to_purchase', 'collection_booked', 'lost', 'returned_to_pool') or p_status is null then
    raise exception 'This status is not available for an accepted marketplace sale.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.dealer_portal_users u join public.dealer_portal_accounts a on a.id = u.dealer_account_id
    where u.user_id = p_dealer_user_id and u.dealer_account_id = p_dealer_account_id and u.active and a.account_status = 'active') then
    raise exception 'Active dealer access is required.' using errcode = '42501';
  end if;
  if p_status = 'lost' and nullif(trim(p_lost_reason), '') is null then
    raise exception 'Select a lost reason.' using errcode = '22023';
  end if;
  select * into v_claim from public.dealer_lead_claims where id = p_claim_id and dealer_account_id = p_dealer_account_id for update;
  if v_claim.id is null then raise exception 'Claim not found for this dealer.' using errcode = '42501'; end if;
  select * into v_lead from public.website_leads where id = v_claim.website_lead_id and opportunity_mode = 'marketplace_offer'
    and accepted_offer_dealer_account_id = p_dealer_account_id for update;
  if v_lead.id is null then raise exception 'Accepted marketplace sale not found.' using errcode = '42501'; end if;
  if v_claim.status = p_status then return to_jsonb(v_claim); end if;
  if v_claim.status in ('purchased', 'purchased_later', 'lost', 'returned_to_pool') or v_lead.marketplace_status is null or v_lead.marketplace_status not in ('offer_accepted', 'purchase_pending') then
    raise exception 'This marketplace sale is already completed or closed. Contact MotorGeeks for help.' using errcode = '22023';
  end if;
  if exists(select 1 from public.dealer_purchases where claim_id = v_claim.id) then
    raise exception 'A reported purchase cannot be marked lost or returned.' using errcode = '22023';
  end if;
  update public.dealer_lead_claims set status = p_status, lost_reason = case when p_status = 'lost' then p_lost_reason else null end,
    outcome_at = case when v_terminal then v_now else null end, returned_at = case when p_status = 'returned_to_pool' then v_now else null end,
    updated_at = v_now where id = v_claim.id returning * into v_claim;
  update public.website_leads set marketplace_status = case when v_terminal then 'cancelled' when p_status = 'collection_booked' then 'purchase_pending' else 'offer_accepted' end,
    status = case when p_status = 'lost' then 'dealer_lost' when p_status = 'returned_to_pool' then 'dealer_returned' else status end,
    updated_at = v_now where id = v_lead.id;
  insert into public.dealer_lead_notes(website_lead_id, claim_id, dealer_account_id, dealer_user_id, note_type, body)
  values(v_lead.id, v_claim.id, p_dealer_account_id, p_dealer_user_id, 'status',
    'Marketplace status changed to ' || p_status || case when p_status = 'lost' then ': ' || p_lost_reason || coalesce(' - ' || nullif(trim(p_lost_reason_detail), ''), '') else '' end);
  insert into public.dealer_portal_audit_events(website_lead_id, dealer_account_id, dealer_user_id, event_type, event_data)
  values(v_lead.id, p_dealer_account_id, p_dealer_user_id, 'marketplace_claim_status_updated',
    jsonb_build_object('claim_id', v_claim.id, 'status', p_status, 'previous_marketplace_status', v_lead.marketplace_status, 'lost_reason', p_lost_reason, 'lost_reason_detail', p_lost_reason_detail));
  return to_jsonb(v_claim);
end;
$$;
revoke all on function public.dealer_update_marketplace_claim(uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.dealer_update_marketplace_claim(uuid,uuid,uuid,text,text,text) to service_role;
commit;
