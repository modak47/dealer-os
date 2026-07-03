export const dealership = {
  dealerName: "YesMoto",
  tradingName: "Sell Your Motorbike Ltd T/A Yes Moto",
  logoText: "YESMOTO",
  domain: "yesmoto.co.uk",
  phone: "07984 763470",
  email: "sellyourmotorbike@gmail.com",
  address: "72 Brentwood Road, Brighton, BN1 7ES",
  primaryColour: "#00E51D",
  redAccent: "#C9181E",
  depositAmount: 99,
  openingHours: "Mon - Sat 9:00 - 18:00",
  heroTagline: "#WEAREYESMOTO",
  heroHeadlineLine1: "BUY, SELL OR FINANCE",
  heroHeadlineLine2: "YOUR NEXT MOTORBIKE.",
  heroSubtitle: "Quality used bikes. Competitive finance. Part exchange welcome.",
  financeBanner: "GOOD CREDIT? POOR CREDIT? WE HAVE YOU COVERED!",
  reserveText: "Reserve for £99",
  socialLinks: {
    facebook: "#",
    instagram: "#",
    youtube: "#",
    tiktok: "#",
  },
} as const;

export const phoneHref = `tel:${dealership.phone.replace(/\s/g, "")}`;
