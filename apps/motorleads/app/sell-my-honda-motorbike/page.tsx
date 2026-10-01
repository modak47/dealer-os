import { hondaGuide } from "../brand-guides";
import { BrandGuide } from "../components/brand-guide";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Sell My Honda Motorbike | Valuation Guide", "Sell or value your Honda through MotorGeeks. Learn what dealers need for Honda scooters, road, sports, adventure and touring motorcycles.", "/sell-my-honda-motorbike");

export default function SellHondaPage() { return <BrandGuide guide={hondaGuide} />; }
