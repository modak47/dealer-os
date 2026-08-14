alter table stock_bikes
  add column if not exists autotrader_stock_id text,
  add column if not exists autotrader_publish_status text not null default 'not_started',
  add column if not exists autotrader_last_payload jsonb,
  add column if not exists autotrader_last_response jsonb,
  add column if not exists autotrader_last_synced_at timestamptz,
  add column if not exists autotrader_publish_error text;

alter table stock_bikes
  drop constraint if exists stock_bikes_autotrader_publish_status_check;

alter table stock_bikes
  add constraint stock_bikes_autotrader_publish_status_check
  check (autotrader_publish_status in ('not_started','draft_ready','created','published','unpublished','failed'));
