import { suzukiGuide } from "../brand-guides";
import { BrandGuide } from "../components/brand-guide";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Sell My Suzuki Motorbike | Valuation Guide", "Sell or value your Suzuki through MotorGeeks with model-specific guidance for GSX, Hayabusa, V-Strom, street motorcycles and scooters.", "/sell-my-suzuki-motorbike");

export default function SellSuzukiPage() { return <BrandGuide guide={suzukiGuide} />; }
