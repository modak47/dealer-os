import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migration = readFileSync("supabase/migrations/20260910000100_motorgeeks_marketplace_offers.sql", "utf8");
const directClaimRoute = readFileSync("app/api/dealer-portal/leads/[id]/claim/route.ts", "utf8");
const directLeadsRoute = readFileSync("app/api/dealer-portal/leads/route.ts", "utf8");
const offerRoute = readFileSync("app/api/dealer-portal/offer-leads/[id]/offer/route.ts", "utf8");
const offerLeadsRoute = readFileSync("app/api/dealer-portal/offer-leads/route.ts", "utf8");
const sellerAcceptRoute = readFileSync("apps/motorleads/app/api/seller/offers/[id]/accept/route.ts", "utf8");
const marketplaceLib = readFileSync("apps/motorleads/app/lib/marketplace.ts", "utf8");

describe("MotorGeeks marketplace offer contract", () => {
  it("keeps direct first-to-claim and marketplace offers on separate routes/RPCs", () => {
    assert.match(directClaimRoute, /dealer_claim_lead/);
    assert.doesNotMatch(directClaimRoute, /dealer_submit_marketplace_offer|seller_accept_marketplace_offer/);
    assert.match(offerRoute, /dealer_submit_marketplace_offer/);
    assert.doesNotMatch(offerRoute, /dealer_claim_lead/);
  });

  it("keeps marketplace leads out of the normal direct-claim Opportunities feed", () => {
    assert.match(directLeadsRoute, /lead\.opportunity_mode === "marketplace_offer"/);
    assert.match(directClaimRoute, /Marketplace opportunities use Make an offer, not Claim opportunity\./);
    assert.match(offerLeadsRoute, /lead\.opportunity_mode !== "marketplace_offer"/);
  });

  it("redacts dealer contact details from seller-visible offer notes", () => {
    assert.match(offerRoute, /function redactOfferNoteContactDetails/);
    assert.match(offerRoute, /\[contact hidden\]/);
    assert.match(offerRoute, /cleanText\(body\.note, 800\)/);
    assert.match(offerRoute, /p_note: note/);
  });

  it("models multiple blind dealer offers instead of a single amount on the lead", () => {
    assert.match(migration, /create table if not exists public\.dealer_offers/);
    assert.match(migration, /amount_pence integer not null/);
    assert.match(migration, /create unique index if not exists dealer_offers_one_current_offer_idx/);
    assert.match(migration, /create unique index if not exists dealer_offers_one_accepted_offer_idx/);
    assert.doesNotMatch(migration, /opportunity\.offer_amount/);
  });

  it("stores seller access hashes and uses tokenless seller sessions", () => {
    assert.match(migration, /seller_access_tokens/);
    assert.match(migration, /token_hash text not null unique/);
    assert.match(marketplaceLib, /tokenHash\(token\)/);
    assert.match(marketplaceLib, /seller_magic_link/);
    assert.match(marketplaceLib, /seller_session/);
    assert.match(sellerAcceptRoute, /acceptSellerOffer/);
  });

  it("accepts an offer atomically and creates a buying claim without marking a purchase fee payable", () => {
    assert.match(migration, /create or replace function public\.seller_accept_marketplace_offer/);
    assert.match(migration, /for update/);
    assert.match(migration, /marketplace_accepted_offer_id is null/);
    assert.match(migration, /status = case when id = p_offer_id then 'accepted' else 'not_selected' end/);
    assert.match(migration, /dealer_lead_claims/);
    assert.doesNotMatch(migration, /insert into public\.dealer_purchase_fees[\s\S]*seller_accept_marketplace_offer/);
  });

  it("keeps marketplace fee configuration separate from direct dealer successful purchase fees", () => {
    assert.match(migration, /create table if not exists public\.marketplace_fee_settings/);
    assert.match(migration, /fee_trigger text not null default 'purchase_reported'/);
    assert.match(migration, /public\.marketplace_purchase_fee_amount/);
    assert.match(migration, /successful_purchase_fee/);
  });
});
