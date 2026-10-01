import { ktmGuide } from "../brand-guides";
import { BrandGuide } from "../components/brand-guide";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Sell My KTM Motorcycle | KTM Valuation Guide", "Sell or value a KTM through MotorGeeks with specific guidance for Duke, Adventure, RC and off-road models, including use, maintenance and modifications.", "/sell-my-ktm-motorcycle");

export default function SellKtmPage() { return <BrandGuide guide={ktmGuide} />; }
