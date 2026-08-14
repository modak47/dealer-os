import { NextResponse } from "next/server";
import { dealership } from "@/config/dealership";
import { absoluteUrl } from "@/lib/site-url";
import { getSupabaseStockBikes, toAdminStockBike } from "@/lib/supabase-stock";
import { isPublic, toPublicBike } from "@/lib/stock";

const headers = [
  "Dealer",
  "Stock ID",
  "Registration",
  "Make",
  "Model",
  "Variant",
  "Year",
  "Mileage",
  "Price",
  "Colour",
  "Engine CC",
  "Body Type",
  "Fuel",
  "Transmission",
  "MOT Expiry",
  "First Registered",
  "Previous Owners",
  "Attention Grabber",
  "Description",
  "Image 1",
  "Image 2",
  "Image 3",
  "Image 4",
  "Image 5",
  "Website URL",
];

export async function GET() {
  const result = await getSupabaseStockBikes();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.configured ? 500 : 503 });
  }

  const rows = result.stock
    .map(toAdminStockBike)
    .filter(isPublic)
    .map((stockBike) => {
      const bike = toPublicBike(stockBike);
      const url = absoluteUrl(`/used-bikes/${bike.slug}`);
      const images = bike.imageUrls.filter((image) => image && !image.includes("bike-placeholder")).slice(0, 5);
      return [
        dealership.dealerName,
        stockBike.stockNumber || stockBike.id,
        stockBike.registration,
        bike.make,
        bike.model,
        bike.variant,
        bike.year || "",
        bike.mileageValue || "",
        bike.price || "",
        bike.colour,
        bike.engineCc || "",
        bike.bodyStyle,
        bike.fuel,
        bike.transmission,
        bike.motExpiry,
        bike.registrationDate,
        bike.previousOwners,
        bike.attentionGrabber,
        bike.description,
        images[0] || "",
        images[1] || "",
        images[2] || "",
        images[3] || "",
        images[4] || "",
        url,
      ];
    });

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="yesmoto-cazoo-stock-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
