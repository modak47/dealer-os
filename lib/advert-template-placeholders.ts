export type AdvertTemplatePlaceholderKey =
  | "bike_name"
  | "make"
  | "model"
  | "variant"
  | "year"
  | "registration"
  | "mileage"
  | "price"
  | "colour"
  | "engine_cc"
  | "owners"
  | "mot_months"
  | "warranty_months"
  | "service_history"
  | "vehicle_type"
  | "dealer_name"
  | "phone"
  | "deposit_amount";

export type AdvertTemplatePlaceholder = {
  key: AdvertTemplatePlaceholderKey;
  token: string;
  label: string;
  example: string;
};

export const ADVERT_TEMPLATE_PLACEHOLDERS: AdvertTemplatePlaceholder[] = [
  { key: "bike_name", token: "{{bike_name}}", label: "Bike name", example: "Yamaha XMAX 250" },
  { key: "make", token: "{{make}}", label: "Make", example: "Yamaha" },
  { key: "model", token: "{{model}}", label: "Model", example: "XMAX 250" },
  { key: "variant", token: "{{variant}}", label: "Variant", example: "ABS" },
  { key: "year", token: "{{year}}", label: "Year", example: "2008" },
  { key: "registration", token: "{{registration}}", label: "Registration", example: "AB08 CDE" },
  { key: "mileage", token: "{{mileage}}", label: "Mileage", example: "2,387" },
  { key: "price", token: "{{price}}", label: "Price", example: "£2,389" },
  { key: "colour", token: "{{colour}}", label: "Colour", example: "Silver" },
  { key: "engine_cc", token: "{{engine_cc}}", label: "Engine cc", example: "250cc" },
  { key: "owners", token: "{{owners}}", label: "Owners", example: "2" },
  { key: "mot_months", token: "{{mot_months}}", label: "MOT months", example: "12" },
  { key: "warranty_months", token: "{{warranty_months}}", label: "Warranty months", example: "3" },
  { key: "service_history", token: "{{service_history}}", label: "Service history", example: "Full service history" },
  { key: "vehicle_type", token: "{{vehicle_type}}", label: "Vehicle type", example: "Scooter" },
  { key: "dealer_name", token: "{{dealer_name}}", label: "Dealer name", example: "YesMoto" },
  { key: "phone", token: "{{phone}}", label: "Phone", example: "01273 123456" },
  { key: "deposit_amount", token: "{{deposit_amount}}", label: "Deposit amount", example: "£99" },
];

export const ADVERT_TEMPLATE_PLACEHOLDER_KEYS = new Set(ADVERT_TEMPLATE_PLACEHOLDERS.map(placeholder => placeholder.key));
