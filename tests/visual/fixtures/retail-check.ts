export type RetailFixture = Record<string, unknown> & { id: string; Status: string };

export const retailRecord: RetailFixture = {
  id: "qa-retail-1", Registration: "AB12CDE", Make: "Honda", Model: "CB650R", Year: 2021, Mileage: 8457,
  Status: "Checked", Derivative: "ABS Euro 5", "Market Retail": 4895, "Fast Sale Retail": 4595, "Premium Retail": 5195,
  "Suggested Offer": 3500, "Target Profit": 1200, "Available Margin": 1395, "Comparable Count": 5, Confidence: "High",
  "Opportunity Score": 86, "Buy Decision": "REVIEW", "Percayso Retail": 4800, "Percayso Trade": 3600,
  "Percayso Independent": 4700, "Percayso Franchise": 5100, "Percayso Days To Sale": 28,
  "Last Checked": "14/11/2026", createdTime: "2026-11-14T12:00:00Z", created_at: "2026-11-14T12:00:00Z",
  "Progress Percent": 100, "Progress Stage": "Complete", "Progress Message": "Retail check complete.",
  "Auto Trader MOT Data": { check: { hpiStatus: "Clear", writtenOff: false, stolen: false, outstandingFinance: false, motExpiry: "2027-06-12", motStatus: "Valid" } },
  "Comparable Summary": "£4,695 | 2020 | 9,250 miles | Red | 22 days\nhttps://example.test/advert/1\n\n£4,995 | 2022 | 6,400 miles | Black | 15 days\nhttps://example.test/advert/2",
};

export const missingRetailRecord: RetailFixture = {
  ...retailRecord, id: "qa-retail-2", Registration: "XY21ZZZ", Make: "BMW",
  Model: "R 1250 GS Adventure Rallye TE with Touring and Dynamic Packages", Status: "Manual Review",
  createdTime: "2026-11-13T12:00:00Z", "Last Checked": "13/11/2026", "Buy Decision": "Manual review",
  "Market Retail": null, "Fast Sale Retail": null, "Premium Retail": null, "Suggested Offer": null,
  "Target Profit": null, "Available Margin": null, "Percayso Retail": null, "Percayso Trade": null,
  "Percayso Independent": null, "Percayso Franchise": null, "Percayso Days To Sale": null,
  "Opportunity Score": 0, "Comparable Count": 0, Confidence: null, "Comparable Summary": null,
  "Auto Trader MOT Data": { check: { category: "N", writtenOff: true, hpiStatus: "Requires review", motStatus: "Unknown" } },
};

export const lookupVehicle = {
  registration: "AB12CDE", vin: "JH2RC123456789012", engineNumber: "RC123456789", make: "Honda", model: "CB650R",
  derivative: "ABS Euro 5", derivativeId: "honda-cb650r-2021", vehicleId: "at-vehicle-1", year: 2021, mileage: 8457,
  engineSize: 649, transmission: "Manual", fuelType: "Petrol", colour: "Red", previousOwners: 2,
  motExpiry: "2027-06-12", taxonomyData: { make: "Honda", model: "CB650R" },
  vehicleCheck: { status: "Clear", clear: true, category: "", writtenOff: false, stolen: false, scrapped: false,
    outstandingFinance: false, privateFinance: false, tradeFinance: false, exported: false, imported: false,
    mileageDiscrepancy: false, highRisk: false, colourChanged: false, plateChanges: 0, previousOwners: 2,
    motExpiry: "2027-06-12", motStatus: "Valid", reportUrl: "https://example.test/vehicle-check.pdf", raw: {} },
};
