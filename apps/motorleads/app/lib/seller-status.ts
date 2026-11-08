export function sellerStatus(value: string, hasOffers: boolean) {
  if (["cancelled", "closed"].includes(value)) return { label: "Closed", heading: "This marketplace profile is closed", copy: "Contact MotorGeeks if you think this status is incorrect or you need help." };
  if (value === "purchased") return { label: "Purchased", heading: "Your motorcycle purchase is complete", copy: "The selected dealer has confirmed the purchase. Contact MotorGeeks if you need help with this completed profile." };
  if (value === "purchase_pending") return { label: "Purchase pending", heading: "Your purchase is being completed", copy: "The selected dealer can contact you to confirm payment, collection and handover arrangements." };
  if (value === "offer_accepted") return { label: "Offer accepted", heading: "Your chosen dealer is ready for the next step", copy: "The dealer can now contact you to arrange the purchase and handover." };
  if (value === "offer_received" || hasOffers) return { label: "Offers received", heading: "You have a dealer offer to review", copy: "Compare the offer details below. You remain in control and do not have to accept an offer." };
  if (value === "live_to_dealers") return { label: "Available to dealers", heading: "Your motorcycle is with matched dealers", copy: "Approved dealers can review your bike and make offers. They cannot see each other’s offers. Any offers you receive will appear here." };
  if (value === "under_review") return { label: "Under review", heading: "MotorGeeks is reviewing your profile", copy: "We are checking the motorcycle details before matching it with suitable approved dealers." };
  return { label: "Profile submitted", heading: "Your motorcycle profile has been received", copy: "MotorGeeks will review the details before matching it with suitable approved dealers." };
}
