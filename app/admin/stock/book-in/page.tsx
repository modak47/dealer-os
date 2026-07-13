import { AdminPage } from "../../dashboard/page";
import { StockBookingForm } from "./stock-booking-form";

export const dynamic = "force-dynamic";

export default function BookIntoStockPage() {
  return <AdminPage
    title="Book Into Stock"
    sub="Create a stock motorcycle, purchase record, immediate costs, ledger entries and preparation workflow in one controlled booking."
  >
    <StockBookingForm />
  </AdminPage>;
}
