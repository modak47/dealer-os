import { piaggioGuide } from "../brand-guides";
import { BrandGuide } from "../components/brand-guide";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Sell My Piaggio Scooter | Valuation Guide", "Prepare your Piaggio scooter for dealer offers with practical guidance on model identity, mileage, bodywork, keys, maintenance and photographs.", "/sell-my-piaggio-scooter");

export default function SellPiaggioPage() { return <BrandGuide guide={piaggioGuide} />; }
