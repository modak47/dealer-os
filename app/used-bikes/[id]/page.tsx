import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBikeBySlugOrId, getPublicStockBikes } from "@/lib/stock";
import { VehicleAdvertView } from "./vehicle-advert-view";

export const dynamic = "force-dynamic";

function bikeTitle(bike: Awaited<ReturnType<typeof getBikeBySlugOrId>>) {
  if (!bike) return "Used Motorcycle";
  return [bike.year, bike.make, bike.model, bike.variant].filter(Boolean).join(" ");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const bike = await getBikeBySlugOrId(id);
  if (!bike) return { title: "Motorcycle not found" };
  const title = `${bikeTitle(bike)} for sale`;
  const descriptionParts = [
    bike.price ? `For sale at £${bike.price.toLocaleString("en-GB")}` : "",
    bike.mileageValue ? `${bike.mileageValue.toLocaleString("en-GB")} miles` : "",
    bike.engineCc ? `${bike.engineCc.toLocaleString("en-GB")}cc` : "",
    "HPI checked and professionally prepared by YesMoto",
  ].filter(Boolean);
  const description = descriptionParts.join(" · ");
  const url = `/used-bikes/${bike.slug}`;
  const image = bike.photoReady ? bike.image : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: image ? [{ url: image, alt: bikeTitle(bike) }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

export default async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bike = await getBikeBySlugOrId(id);
  if (!bike) notFound();
  const related = await getPublicStockBikes();
  return <VehicleAdvertView bike={bike} related={related} />;
}
