import { harleyGuide } from "../brand-guides";
import { BrandGuide } from "../components/brand-guide";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Sell My Harley-Davidson | Valuation Guide", "Prepare your Harley-Davidson for dealer offers with clear factory specification, accessory, modification, documentation and condition guidance.", "/sell-my-harley-davidson");

export default function SellHarleyPage() { return <BrandGuide guide={harleyGuide} />; }
