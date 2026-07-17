export const OPPORTUNITY_STATUSES = [
  "New",
  "Seen",
  "Researching",
  "Contacted",
  "Negotiating",
  "Purchased",
  "Rejected",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];
export type OpportunityDisplayStatus = OpportunityStatus | "Hidden";

export type Opportunity = {
  "Listing ID": number;
  "Score": number;
  "Potential Margin": string;
  "Asking Price": string;
  "Dealer Median": string;
  "Comparable Count": number;
  "Make": string;
  "Model": string;
  "Year": number;
  "Mileage": number;
  "Seller Type": string;
  "Advert URL": string | null;
  "First Seen Date": string | null;
  "Days Live": number | null;
  listingFirstSeenAt: string | null;
  listingLastConfirmedAt: string | null;
  listingDaysLive: number | null;
  isNewListing: boolean;
  "Derivative ID": string;
  "HPI Category"?: string | null;
  "Margin %": string;
  seen: boolean;
  notes: string | null;
  status: OpportunityStatus | null;
  favourite: boolean;
  hidden: boolean;
  last_seen: string | null;
  primary_image_url?: string | null;
  updated_at: string | null;
};

export type UserManagedOpportunityFields = Pick<
  Opportunity,
  "notes" | "status" | "favourite" | "hidden"
>;

export type OpportunityPatch = Partial<UserManagedOpportunityFields>;

export type ScannerStatus = {
  last_run: string;
  opportunity_count: number;
};

export type OpportunityActivity = {
  id: number;
  listing_id: number;
  activity_type: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type OpportunityComparable = {
  id: number;
  opportunity_listing_id: number;
  comparable_listing_id: number | null;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  price: string | null;
  seller_type: string | null;
  advert_url: string | null;
  dealer_name: string | null;
  distance: string | null;
  image_url?: string | null;
  created_at: string | null;
};

export type OpportunityDrawerSection = "overview" | "comparables" | "activity";

export type SortOption = "score" | "margin" | "newest" | "oldest" | "daysLive";
