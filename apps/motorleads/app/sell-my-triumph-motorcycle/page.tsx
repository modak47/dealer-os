import { triumphGuide } from "../brand-guides";
import { BrandGuide } from "../components/brand-guide";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Sell My Triumph Motorcycle | Valuation Guide", "Sell or value your Triumph through MotorGeeks. Prepare your model, fitted features and condition details for Bonneville, Triple, Tiger and other Triumph bikes.", "/sell-my-triumph-motorcycle");

export default function SellTriumphPage() { return <BrandGuide guide={triumphGuide} />; }
