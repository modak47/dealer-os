import { royalEnfieldGuide } from "../brand-guides";
import { BrandGuide } from "../components/brand-guide";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Sell My Royal Enfield | Motorcycle Valuation Guide", "Prepare your Royal Enfield for dealer offers with guidance for Classic, Bullet, Meteor, 650 twin, Himalayan and newer model families.", "/sell-my-royal-enfield");

export default function SellRoyalEnfieldPage() { return <BrandGuide guide={royalEnfieldGuide} />; }
