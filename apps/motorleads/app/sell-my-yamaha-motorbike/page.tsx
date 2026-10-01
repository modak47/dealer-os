import { yamahaGuide } from "../brand-guides";
import { BrandGuide } from "../components/brand-guide";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Sell My Yamaha Motorbike | Valuation Guide", "Prepare your Yamaha for dealer offers with model, mileage, history and photo guidance for scooters, MT, R-series, TRACER and Ténéré motorcycles.", "/sell-my-yamaha-motorbike");

export default function SellYamahaPage() { return <BrandGuide guide={yamahaGuide} />; }
