-- Independent security containment. Do not apply automatically.
-- Preserve current function bodies, including the already-live PT409 retry fix.
begin;
revoke all on function public.dealer_submit_marketplace_offer(bigint,uuid,uuid,integer,text) from public, anon, authenticated;
revoke all on function public.seller_accept_marketplace_offer(bigint,uuid) from public, anon, authenticated;
revoke all on function public.marketplace_purchase_fee_amount(bigint,uuid) from public, anon, authenticated;
grant execute on function public.dealer_submit_marketplace_offer(bigint,uuid,uuid,integer,text) to service_role;
grant execute on function public.seller_accept_marketplace_offer(bigint,uuid) to service_role;
grant execute on function public.marketplace_purchase_fee_amount(bigint,uuid) to service_role;
commit;
