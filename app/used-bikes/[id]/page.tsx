import { notFound } from "next/navigation";
import { getBikeBySlugOrId, getPublicStockBikes } from "@/lib/stock";
import { VehicleAdvertView } from "./vehicle-advert-view";

export const dynamic = "force-dynamic";

export default async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bike = await getBikeBySlugOrId(id);
  if (!bike) notFound();
  const related = await getPublicStockBikes();
  return <VehicleAdvertView bike={bike} related={related} />;
}
