import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normaliseRegistration, parseWebsiteLeadWebhookPayload, websiteLeadInsertPayload } from "../lib/website-lead-webhook";

describe("website lead webhook payload mapping", () => {
  it("maps a Bike Buyer UK payload into canonical lead fields", () => {
    const lead = parseWebsiteLeadWebhookPayload({
      source: "bike_buyer_uk",
      external_submission_id: "bbuk-123",
      form_name: "Vehicle valuation",
      submitted_at: "2026-07-31T10:00:00Z",
      reg: " ab12 cde ",
      make: "Honda",
      model: "CBR 600",
      email: " CUSTOMER@EXAMPLE.COM ",
      phone: "+44 7700 900123",
      postcode: "sw1a1aa",
      image1: "https://example.com/1.jpg",
    });

    assert.equal(lead.external_submission_id, "bbuk-123");
    assert.equal(lead.lead_source, "bike_buyer_uk");
    assert.equal(lead.website, "bikebuyeruk");
    assert.equal(lead.reg, "AB12CDE");
    assert.equal(lead.email, "customer@example.com");
    assert.equal(lead.phone, "07700900123");
    assert.equal(lead.postcode, "SW1A 1AA");
    assert.deepEqual(lead.images, ["https://example.com/1.jpg"]);
  });

  it("maps a Sell Your Motorbike payload and recognises Zapier-style application keys", () => {
    const lead = parseWebsiteLeadWebhookPayload({
      source: "sellyourmotorbike",
      applicationId: "49",
      application_reg: "RA06 MVC",
      application_make: "Honda",
      application_model: "CBR 600",
      firstName: "Dan",
      lastName: "Byrne",
    });

    assert.equal(lead.external_submission_id, "49");
    assert.equal(lead.lead_source, "sell_your_motorbike");
    assert.equal(lead.website, "sellyourmotorbike");
    assert.equal(lead.reg, "RA06MVC");
    assert.equal(lead.make, "Honda");
  });

  it("recognises spaced and capitalised legacy form field names", () => {
    const lead = parseWebsiteLeadWebhookPayload({
      Website: "Bike Buyer UK",
      "Application Id": "legacy-50",
      "Application Reg": "AB12 CDE",
      "Application Make": "Yamaha",
      "Application Model": "MT-07",
      "First Name": "Leo",
      "Last Name": "Byrne",
      "Customer Email": " LEO@EXAMPLE.COM ",
      "Customer Phone": "07700 900123",
      Postcode: "m11ae",
    });

    assert.equal(lead.external_submission_id, "legacy-50");
    assert.equal(lead.lead_source, "bike_buyer_uk");
    assert.equal(lead.reg, "AB12CDE");
    assert.equal(lead.make, "Yamaha");
    assert.equal(lead.model, "MT-07");
    assert.equal(lead.fname, "Leo");
    assert.equal(lead.email, "leo@example.com");
    assert.equal(lead.postcode, "M1 1AE");
  });

  it("treats YesMoto website values as Sell Your Motorbike leads", () => {
    const lead = parseWebsiteLeadWebhookPayload({
      website: "yesmoto.co.uk",
      id: "722",
      reg: "MT07 ABC",
      make: "Yamaha",
      model: "MT-07",
      fname: "Dan",
      phone: "07700900123",
    });

    assert.equal(lead.external_submission_id, "722");
    assert.equal(lead.lead_source, "sell_your_motorbike");
    assert.equal(lead.website, "sellyourmotorbike");
  });

  it("accepts webhook payloads that only provide a website field", () => {
    const lead = parseWebsiteLeadWebhookPayload({
      website: "YesMoto website",
      id: "724",
      reg: "AB12 CDE",
      fname: "Dan",
      phone: "07700900123",
    });

    assert.equal(lead.external_submission_id, "724");
    assert.equal(lead.lead_source, "sell_your_motorbike");
  });

  it("saves leads without images using an empty image array", () => {
    const lead = parseWebsiteLeadWebhookPayload({
      source: "sell_your_motorbike",
      id: "723",
      reg: "AB12 CDE",
      fname: "Dan",
      phone: "07700900123",
    });

    assert.equal(lead.images, null);
    assert.deepEqual(websiteLeadInsertPayload(lead).images, []);
  });

  it("accepts sparse source rows when they include an id", () => {
    const lead = parseWebsiteLeadWebhookPayload({
      id: "720",
      website: "sellyourmotorbike",
      reg: "",
      make: "",
      model: "",
      mot: "",
      image1: "",
    });

    assert.equal(lead.external_submission_id, "720");
    assert.equal(lead.lead_source, "sell_your_motorbike");
    assert.equal(lead.reg, null);
    assert.equal(lead.mot, null);
    assert.equal(lead.images, null);
  });

  it("defaults authenticated webhook payloads without a recognised source", () => {
    const lead = parseWebsiteLeadWebhookPayload({
      source: "unknown",
      reg: "AB12 CDE",
      fname: "Dan",
      phone: "07700900123",
    });

    assert.equal(lead.lead_source, "sell_your_motorbike");
  });

  it("normalises registrations safely", () => {
    assert.equal(normaliseRegistration(" ra06 mvc "), "RA06MVC");
  });
});
