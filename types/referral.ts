import type { WebsiteLead } from "@/types/website-lead";

export type ReferralMethod = "email" | "whatsapp" | "sms";
export type ReferralStatus = "Draft" | "Prepared" | "Sent" | "Opened in WhatsApp" | "Opened in SMS" | "Failed" | "Cancelled" | "Dealer Interested" | "Dealer Declined" | "Customer Contacted" | "Completed";
export type DealerOutcome = "Awaiting response" | "Dealer interested" | "Dealer declined" | "Customer contacted" | "Completed" | "Cancelled";

export type DealerContact = {
  id: string;
  dealer_name: string;
  contact_name: string | null;
  email: string | null;
  mobile_number: string | null;
  landline_number: string | null;
  whatsapp_number: string | null;
  town: string | null;
  postcode: string | null;
  notes: string | null;
  preferred_contact_method: ReferralMethod | "phone";
  active: boolean;
  brands_handled?: string[];
  max_collection_radius_miles?: number | null;
  bike_types_interested?: string | null;
  min_purchase_value?: number | null;
  max_purchase_value?: number | null;
  referral_fee_arrangement?: string | null;
  last_referral_date?: string | null;
  total_referrals?: number | null;
  successful_referrals?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  recent_referrals?: LeadReferral[];
};

export type ReferralShareOptions = {
  registration: boolean;
  makeModel: boolean;
  year: boolean;
  mileage: boolean;
  askingPrice: boolean;
  condition: boolean;
  serviceHistory: boolean;
  mot: boolean;
  town: boolean;
  partialPostcode: boolean;
  fullPostcode: boolean;
  photos: boolean;
  customerNotes: boolean;
  customerName: boolean;
  customerPhone: boolean;
  customerEmail: boolean;
  fullAddress: boolean;
};

export type LeadReferral = {
  id: string;
  website_lead_id: number;
  dealer_contact_id: string;
  communication_method: ReferralMethod;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  message_subject: string | null;
  message_body: string;
  information_shared: Record<string, unknown>;
  customer_details_included: Record<string, unknown>;
  customer_consent_confirmed: boolean;
  customer_consent_source: string | null;
  customer_consent_confirmed_at: string | null;
  customer_consent_confirmed_by: string | null;
  referral_status: ReferralStatus;
  dealer_outcome: DealerOutcome;
  sent_at: string | null;
  opened_externally_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  provider: string | null;
  provider_message_id: string | null;
  provider_response: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  dealer?: Pick<DealerContact, "dealer_name" | "contact_name" | "email" | "mobile_number" | "whatsapp_number" | "town"> | null;
};

export type ReferralDraft = {
  subject: string;
  body: string;
  informationShared: Record<string, unknown>;
  customerDetailsIncluded: Record<string, unknown>;
  mailtoUrl: string | null;
  whatsappUrl: string | null;
  smsUrl: string | null;
};

export type ReferralLead = WebsiteLead & {
  referral_count?: number | null;
  latest_referral_id?: string | null;
  latest_referred_dealer_id?: string | null;
  latest_referred_dealer_name?: string | null;
  latest_referred_at?: string | null;
};
