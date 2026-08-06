import { AdminPage } from "../../dashboard/page";
import { getReservationAddons } from "@/lib/reservation-addons";
import { ReservationExtrasEditor } from "./reservation-extras-editor";

export const dynamic = "force-dynamic";

export default async function ReservationExtrasSettingsPage() {
  const addons = await getReservationAddons();
  return <AdminPage title="Reservation Extras" sub="Configure the warranty, delivery and optional extras customers can select before paying their reservation fee.">
    <ReservationExtrasEditor initialAddons={addons} />
  </AdminPage>;
}
