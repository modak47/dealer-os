import type { WebsiteLead } from "./website-lead";

export type DealerPortalAccountStatus = "pending" | "active" | "suspended" | "closed";
export type DealerPortalUserRole = "dealer_admin" | "dealer_user";
export type DealerLeadAllocationStatus = "available" | "claimed" | "expired" | "withdrawn" | "excluded";
export type DealerLeadClaimStatus = "claimed" | "attempting_contact" | "contacted" | "offer_made" | "negotiating" | "agreed_to_purchase" | "collection_booked" | "purchased" | "lost" | "returned_to_pool" | "purchased_later";

export type DealerPortalAccount = {
  id: string;
  trading_name: string;
  limited_company_name: string | null;
  company_registration_number: string | null;
  vat_number: string | null;
  registered_address: string | null;
  trading_address: string | null;
  main_contact: string | null;
  telephone: string | null;
  mobile_whatsapp: string | null;
  main_email: string | null;
  accounts_email: string | null;
  website: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  autotrader_dealer_ref: string | null;
  account_status: DealerPortalAccountStatus;
  successful_purchase_fee: number;
  attribution_period_days: number;
  claim_expiry_hours: number | null;
  update_deadline_hours: number | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DealerLeadAllocation = {
  id: string;
  website_lead_id: number;
  dealer_account_id: string;
  allocation_method: "direct" | "dealer_group" | "matching_pool" | "priority";
  allocation_status: DealerLeadAllocationStatus;
  match_score: number | null;
  match_reasons: Record<string, unknown>;
  excluded_reasons: Record<string, unknown>;
  allocated_at: string;
  notified_at: string | null;
  expires_at: string | null;
  dealer?: Pick<DealerPortalAccount, "id" | "trading_name" | "account_status"> | null;
};

export type DealerLeadClaim = {
  id: string;
  website_lead_id: number;
  dealer_account_id: string;
  dealer_user_id: string | null;
  allocation_id: string | null;
  status: DealerLeadClaimStatus;
  claimed_at: string;
  customer_details_unlocked_at: string;
  outcome_at: string | null;
  lost_reason: string | null;
  returned_at: string | null;
  attribution_expires_at: string | null;
  notes: string | null;
  lead?: WebsiteLead | null;
};

export type DealerLeadNote = {
  id: string;
  website_lead_id: number;
  claim_id: string | null;
  dealer_account_id: string;
  dealer_user_id: string | null;
  note_type: "note" | "call" | "email" | "sms" | "whatsapp" | "offer" | "status";
  body: string;
  created_at: string;
};

export type DealerPurchase = {
  id: string;
  website_lead_id: number;
  claim_id: string;
  dealer_account_id: string;
  purchase_type: "dealer_reported" | "dealer_reported_later" | "stock_matching_admin_confirmed" | "other";
  purchase_price: number;
  purchase_date: string;
  collection_date: string | null;
  mileage_at_purchase: number | null;
  notes: string | null;
  reported_by: string | null;
  reported_at: string;
  created_at: string;
};

export type DealerPurchaseFee = {
  id: string;
  purchase_id: string;
  dealer_account_id: string;
  website_lead_id: number;
  fee_amount: number;
  status: "pending_invoice" | "invoiced" | "paid" | "credited" | "void";
  credit_amount: number;
  adjustment_amount: number;
  invoiced_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DealerVisibleLead = WebsiteLead & {
  portal_allocation_id?: string | null;
  portal_claim_id?: string | null;
  portal_claim_status?: DealerLeadClaimStatus | null;
  portal_lost_reason?: string | null;
  portal_attribution_expires_at?: string | null;
  portal_notes?: DealerLeadNote[];
  portal_distance_miles?: number | null;
  portal_distance_label?: string | null;
  portal_location_label?: string | null;
  customer_unlocked?: boolean;
};
