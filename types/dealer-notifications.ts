export type DealerNotificationChannel = "email" | "whatsapp" | "event";
export type DealerNotificationStatus = "queued" | "sent" | "failed" | "not_configured" | "skipped";

export type DealerNotificationEventType =
  | "new_suitable_lead"
  | "direct_allocation"
  | "dealer_group_allocation"
  | "lead_claimed"
  | "claim_already_claimed"
  | "lead_returned"
  | "lead_rereleased"
  | "purchase_reported"
  | "successful_purchase_fee_created"
  | "update_required"
  | "approaching_expiry";

export type DealerNotificationInsert = {
  dedupe_key: string;
  website_lead_id?: number | null;
  dealer_account_id: string;
  dealer_user_id?: string | null;
  allocation_id?: string | null;
  claim_id?: string | null;
  purchase_id?: string | null;
  fee_id?: string | null;
  event_type: DealerNotificationEventType;
  channel: DealerNotificationChannel;
  destination?: string | null;
  subject?: string | null;
  message_body?: string | null;
  payload?: Record<string, unknown>;
  status: DealerNotificationStatus;
  provider?: string | null;
  provider_message_id?: string | null;
  provider_response?: Record<string, unknown>;
  safe_error?: string | null;
  queued_at?: string | null;
  sent_at?: string | null;
  failed_at?: string | null;
  created_by?: string | null;
};
