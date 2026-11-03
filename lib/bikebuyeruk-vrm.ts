import { z } from "zod";
import type { DealerOsVehicle } from "@/lib/autotrader-vehicle-lookup";

export const bikeBuyerVrmSchema = z.strictObject({
  registration: z.string().trim().min(2).max(12)
    .transform(value => value.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{2,8}$/, "Enter a valid UK registration.")),
  dry_run: z.boolean().default(false),
});

export function bikeBuyerVehicleFields(vehicle: DealerOsVehicle, registration: string) {
  // Only fields accepted by the existing lead API. Never return VIN, keeper
  // information, paid check products, provider IDs, or raw provider responses.
  const fields: { reg: string; make?: string; model?: string; year?: number; engine?: string; colour?: string } = { reg: registration };
  const make = vehicle.make?.trim().slice(0, 80);
  const model = vehicle.model?.trim().slice(0, 120);
  const colour = vehicle.colour?.trim().slice(0, 60);
  if (make) fields.make = make;
  if (model) fields.model = model;
  if (colour) fields.colour = colour;
  if (Number.isInteger(vehicle.year) && vehicle.year! >= 1900 && vehicle.year! <= new Date().getFullYear() + 1) fields.year = vehicle.year;
  if (vehicle.engineSize != null && String(vehicle.engineSize).trim()) fields.engine = String(vehicle.engineSize).trim().slice(0, 60);
  return fields;
}
