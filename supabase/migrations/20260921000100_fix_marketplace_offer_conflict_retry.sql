-- Business conflicts must not use serialization_failure (40001): PostgREST 14
-- retries that code indefinitely, even after the original HTTP caller leaves.
-- PT409 returns HTTP 409 without retrying. Preserve the deployed function body,
-- ownership, grants, locking and successful acceptance behaviour.
do $migration$
declare
  definition text := pg_get_functiondef('public.seller_accept_marketplace_offer(bigint,uuid)'::regprocedure);
  conflict_message text;
  old_raise text;
  new_raise text;
begin
  foreach conflict_message in array array[
    'Offer is no longer available.',
    'This opportunity has already accepted an offer or is not available.'
  ] loop
    old_raise := format('raise exception %L using errcode = %L;', conflict_message, '40001');
    new_raise := format('raise exception %L using errcode = %L;', conflict_message, 'PT409');
    if strpos(definition, old_raise) > 0 then
      definition := replace(definition, old_raise, new_raise);
    elsif strpos(definition, new_raise) = 0 then
      raise exception 'Unexpected marketplace function definition; conflict fix was not applied.';
    end if;
  end loop;
  execute definition;
end;
$migration$;
