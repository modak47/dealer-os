-- Read-only diagnostics. Run through the Management API, not the public API.
begin read only;
set local statement_timeout = '30s';

select c.relname, c.reltuples::bigint as estimated_rows,
  pg_size_pretty(pg_relation_size(c.oid)) as heap_size,
  pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  s.n_live_tup, s.n_dead_tup, s.last_autovacuum, s.last_autoanalyze,
  s.seq_scan, s.idx_scan
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public' and c.relname = 'autotrader_listings';

select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'autotrader_listings';

select policyname, roles, cmd, qual from pg_policies
where schemaname = 'public' and tablename = 'autotrader_listings';

select extname from pg_extension where extname in ('pg_cron', 'pg_stat_statements', 'pg_trgm');

explain (analyze, buffers, format json)
select count(*) from public.autotrader_listings;

rollback;
