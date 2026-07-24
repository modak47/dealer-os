import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { dealership } from "@/config/dealership";
import { absoluteUrl } from "@/lib/site-url";
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
  const title = `${bikeTitle(bike)} for sale in Brighton`;
  const descriptionParts = [
    bike.price ? `For sale at GBP ${bike.price.toLocaleString("en-GB")}` : "",
    bike.mileageValue ? `${bike.mileageValue.toLocaleString("en-GB")} miles` : "",
    bike.engineCc ? `${bike.engineCc.toLocaleString("en-GB")}cc` : "",
    bike.colour || "",
    "HPI checked, professionally prepared and available from YesMoto",
  ].filter(Boolean);
  const description = descriptionParts.join(" - ");
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

function bikeStructuredData(bike: Awaited<ReturnType<typeof getBikeBySlugOrId>>) {
  if (!bike) return null;
  const name = bikeTitle(bike);
  const url = absoluteUrl(`/used-bikes/${bike.slug}`);
  const images = bike.photoReady ? bike.imageUrls.filter((image) => !image.includes("bike-placeholder")).map(absoluteUrl) : [];
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: bike.description || `${name} for sale at ${dealership.dealerName}. HPI checked and professionally prepared.`,
    image: images.length ? images : undefined,
    brand: bike.make ? { "@type": "Brand", name: bike.make } : undefined,
    model: bike.model,
    sku: bike.id,
    category: "Motorcycle",
    additionalProperty: [
      bike.year ? { "@type": "PropertyValue", name: "Year", value: String(bike.year) } : null,
      bike.mileageValue ? { "@type": "PropertyValue", name: "Mileage", value: `${bike.mileageValue.toLocaleString("en-GB")} miles` } : null,
      bike.engineCc ? { "@type": "PropertyValue", name: "Engine", value: `${bike.engineCc.toLocaleString("en-GB")}cc` } : null,
      bike.colour ? { "@type": "PropertyValue", name: "Colour", value: bike.colour } : null,
      bike.transmission ? { "@type": "PropertyValue", name: "Transmission", value: bike.transmission } : null,
    ].filter(Boolean),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "GBP",
      price: bike.price,
      availability: bike.status === "Reserved" ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      seller: {
        "@type": "AutoDealer",
        name: dealership.dealerName,
        telephone: dealership.phone,
        email: dealership.email,
        address: dealership.address,
        url: absoluteUrl("/"),
      },
    },
  };
}

export default async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bike = await getBikeBySlugOrId(id);
  if (!bike) notFound();
  const related = await getPublicStockBikes();
  const structuredData = bikeStructuredData(bike);
  return <>
    {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />}
    <VehicleAdvertView bike={bike} related={related} />
  </>;
}
