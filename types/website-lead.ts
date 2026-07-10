export const WEBSITE_LEAD_STATUSES = ["new", "reviewing", "contacted", "offer_made", "accepted", "declined", "purchased", "closed"] as const;
export const WEBSITE_VALUATION_STATUSES = ["pending", "in_progress", "valued", "offer_ready", "needs_review", "complete"] as const;
export const WEBSITE_LEAD_SOURCES = ["bikebuyeruk", "sellyourmotorbike", "motorcyclebuyer"] as const;

export type WebsiteLeadStatus = typeof WEBSITE_LEAD_STATUSES[number];
export type WebsiteValuationStatus = typeof WEBSITE_VALUATION_STATUSES[number] | string;
export type WebsiteLeadSource = typeof WEBSITE_LEAD_SOURCES[number] | string;

export type WebsiteLead = {
  id: number;
  owner: string | null;
  reg: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  engine: string | null;
  colour: string | null;
  mileage: string | null;
  owners: string | null;
  spare_keys: string | null;
  bike_condition: string | null;
  damage: string | null;
  history: string | null;
  service: string | null;
  mot: string | null;
  extras: string | null;
  price: string | null;
  fname: string | null;
  lname: string | null;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  image1: string | null;
  image2: string | null;
  image3: string | null;
  image4: string | null;
  image5: string | null;
  image6: string | null;
  image7: string | null;
  image8: string | null;
  image9: string | null;
  image10: string | null;
  website: WebsiteLeadSource | null;
  date: string | null;
  Images: string | null;
  valuation_status: WebsiteValuationStatus | null;
  retail_estimate: number | null;
  suggested_offer: number | null;
  estimated_margin: number | null;
  similar_bikes: string | null;
  auto_trader_search: string | null;
  valuation_notes: string | null;
  "Motorway output": string | null;
  retail_check_id?: string | null;
  valuation_started_at?: string | null;
  valuation_completed_at?: string | null;
  valuation_error?: string | null;
  images: string[] | null;
  status: WebsiteLeadStatus | string | null;
  assigned_to: string | null;
  contacted_at: string | null;
  offer_made_at: string | null;
  purchased_at: string | null;
  internal_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  resolved_images?: string[];
};

export type WebsiteLeadUpdate = Partial<Pick<WebsiteLead,
  "valuation_status" | "retail_estimate" | "suggested_offer" | "estimated_margin" | "similar_bikes" |
  "auto_trader_search" | "valuation_notes" | "Motorway output" | "internal_notes" | "status" |
  "assigned_to" | "contacted_at" | "offer_made_at" | "purchased_at"
>> & {
  retail_check_id?: string | null;
  valuation_started_at?: string | null;
  valuation_completed_at?: string | null;
  valuation_error?: string | null;
};
