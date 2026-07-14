import os
import signal
import socket
import time
import traceback
import uuid

from supabase import create_client

from retail_check import mark_failed, process_retail_check


SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
POLL_SECONDS = float(os.getenv("RETAIL_CHECK_POLL_SECONDS", "2"))
STALE_MINUTES = int(os.getenv("RETAIL_CHECK_STALE_MINUTES", "10"))
MAX_ATTEMPTS = int(os.getenv("RETAIL_CHECK_MAX_ATTEMPTS", "3"))

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
worker_id = f"{socket.gethostname()}-{uuid.uuid4().hex[:10]}"
running = True


def stop(_signum, _frame):
    global running
    print("Shutdown requested; worker will stop after current job.", flush=True)
    running = False


def recover_stale_jobs():
    try:
        result = (
            supabase.rpc(
                "recover_stale_retail_checks",
                {
                    "stale_after": f"{STALE_MINUTES} minutes",
                    "max_attempts": MAX_ATTEMPTS,
                },
            )
            .execute()
        )
        print(f"Stale recovery result: {result.data}", flush=True)
    except Exception as exc:
        print(f"Stale recovery failed safely: {exc}", flush=True)


def claim_next_job():
    result = (
        supabase.rpc(
            "claim_next_retail_check",
            {"worker_identifier": worker_id},
        )
        .execute()
    )
    return result.data


def main():
    print(f"YesMoto Retail Check worker started: {worker_id}", flush=True)
    recover_stale_jobs()
    backoff = POLL_SECONDS

    while running:
        try:
            record = claim_next_job()
            backoff = POLL_SECONDS
        except Exception as exc:
            print(f"Unable to claim retail check: {exc}", flush=True)
            time.sleep(min(backoff, 30))
            backoff = min(backoff * 2, 30)
            continue

        if not record:
            time.sleep(POLL_SECONDS)
            continue

        record_id = record.get("id")
        print(f"Claimed retail check {record_id}", flush=True)

        try:
            process_retail_check(record, worker_id=worker_id, supabase_client=supabase, max_attempts=MAX_ATTEMPTS)
            print(f"Finished retail check {record_id}", flush=True)
        except Exception as exc:
            print(f"Retail check {record_id} failed in worker.", flush=True)
            print(traceback.format_exc(), flush=True)
            try:
                mark_failed(record_id, str(exc), worker_id=worker_id, supabase_client=supabase, max_attempts=MAX_ATTEMPTS)
            except Exception as update_exc:
                print(f"Unable to write failure for {record_id}: {update_exc}", flush=True)

    print("YesMoto Retail Check worker stopped.", flush=True)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    main()
