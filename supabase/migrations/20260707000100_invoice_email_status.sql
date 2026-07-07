-- Stage 2: distinguish a missing email provider from a delivery failure.
alter table public.crm_email_logs drop constraint if exists crm_email_logs_status_check;
alter table public.crm_email_logs add constraint crm_email_logs_status_check
  check(status in ('draft','queued','sent','failed','not_configured'));
