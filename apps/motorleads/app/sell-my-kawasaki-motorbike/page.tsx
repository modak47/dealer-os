import { kawasakiGuide } from "../brand-guides";
import { BrandGuide } from "../components/brand-guide";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Sell My Kawasaki Motorbike | Valuation Guide", "Prepare a Kawasaki Ninja, Z, Versys, Vulcan or other model for dealer offers with accurate condition, history, modification and photo guidance.", "/sell-my-kawasaki-motorbike");

export default function SellKawasakiPage() { return <BrandGuide guide={kawasakiGuide} />; }
