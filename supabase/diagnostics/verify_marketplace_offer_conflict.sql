-- Safe regression check: NULL IDs cannot match an offer. No business records
-- are created or modified, and all work is rolled back.
begin;
set local statement_timeout = '5s';
do $test$
declare
  definition text := pg_get_functiondef('public.seller_accept_marketplace_offer(bigint,uuid)'::regprocedure);
begin
  if strpos(definition, '40001') > 0
     or (length(definition) - length(replace(definition, 'PT409', ''))) / 5 <> 2 then
    raise exception 'Both marketplace conflict branches must return non-retryable PT409';
  end if;
  begin
    perform public.seller_accept_marketplace_offer(null::bigint, null::uuid);
    raise exception 'Expected an unavailable-offer conflict';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'Offer is no longer available.' then
      raise exception 'Unexpected conflict message: %', sqlerrm;
    end if;
  end;
end;
$test$;
rollback;
