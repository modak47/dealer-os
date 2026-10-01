import { bmwGuide } from "../brand-guides";
import { BrandGuide } from "../components/brand-guide";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Sell My BMW Motorcycle | BMW Valuation Guide", "Sell or value a BMW motorcycle through MotorGeeks. Document the exact GS, touring, roadster, sport or heritage specification, service history and equipment.", "/sell-my-bmw-motorcycle");

export default function SellBmwPage() { return <BrandGuide guide={bmwGuide} />; }
