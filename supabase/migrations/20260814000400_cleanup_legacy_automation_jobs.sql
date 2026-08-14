delete from public.automation_jobs
where job_name in ('scrapers', 'recent_scraper', 'retail_scanner');
