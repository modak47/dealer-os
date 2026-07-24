import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { normalizeSupabaseStockBike } from "@/lib/supabase-stock";
import { defaultPdiChecklist, type PdiFormPayload, type PdiSection } from "@/lib/stock-pdi-types";

const templatePath = path.join(process.cwd(), "assets", "pdi", "yesmoto-used-pdi-template.pdf");
const safe = (value: unknown) => String(value ?? "")
  .replace(/[\u2610\u25A1]/g, "[ ]")
  .replace(/[\u2611\u2713\u2714]/g, "X")
  .replace(/[\u2010-\u2015]/g, "-")
  .replace(/\u00A3/g, "GBP ")
  .replace(/[^\x20-\x7E]/g, " ");

type TextOptions = NonNullable<Parameters<PDFPage["drawText"]>[1]>;

function drawText(page: PDFPage, value: unknown, options: TextOptions) {
  page.drawText(safe(value), options);
}

function fitText(page: PDFPage, font: PDFFont, value: unknown, x: number, y: number, maxWidth: number, size: number) {
  const text = safe(value).trim();
  if (!text) return;
  let next = text;
  while (next.length > 1 && font.widthOfTextAtSize(next, size) > maxWidth) next = next.slice(0, -1);
  drawText(page, next, { x, y, size, font, color: rgb(0, 0, 0) });
}

function drawTick(page: PDFPage, x: number, y: number, size = 8) {
  const color = rgb(0, 0.72, 0.12);
  page.drawLine({ start: { x, y: y + size * 0.42 }, end: { x: x + size * 0.32, y }, thickness: 1.35, color });
  page.drawLine({ start: { x: x + size * 0.32, y }, end: { x: x + size, y: y + size }, thickness: 1.35, color });
}

async function drawDealerStamp(pdf: PDFDocument, page: PDFPage) {
  try {
    const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", "yesmoto-logo.png")));
    page.drawImage(logo, { x: 425, y: 227, width: 82, height: 28 });
  } catch {
    return;
  }
}

async function drawSignature(pdf: PDFDocument, page: PDFPage, dataUrl: string | undefined, x: number, y: number, width: number, height: number) {
  if (!dataUrl?.startsWith("data:image/png;base64,")) return;
  try {
    const image = await pdf.embedPng(Buffer.from(dataUrl.split(",")[1], "base64"));
    page.drawImage(image, { x, y, width, height });
  } catch {
    return;
  }
}

function checklistKey(section: PdiSection, number: number, occurrence = 0) {
  return `${section}:${number}:${occurrence}`;
}

const checkboxPositions: Record<string, { x: number; y: number }> = {
  [checklistKey("RAMP DOWN [1]", 1)]: { x: 38, y: 592 },
  [checklistKey("RAMP DOWN [1]", 2)]: { x: 38, y: 562 },
  [checklistKey("RAMP DOWN [1]", 3)]: { x: 38, y: 531 },
  [checklistKey("RAMP DOWN [1]", 4)]: { x: 38, y: 501 },
  [checklistKey("RAMP DOWN [1]", 5)]: { x: 38, y: 471 },

  [checklistKey("RAMP UP", 1)]: { x: 170, y: 592 },
  [checklistKey("RAMP UP", 2)]: { x: 170, y: 562 },
  [checklistKey("RAMP UP", 3)]: { x: 170, y: 531 },
  [checklistKey("RAMP UP", 4)]: { x: 170, y: 501 },
  [checklistKey("RAMP UP", 5)]: { x: 170, y: 471 },
  [checklistKey("RAMP UP", 6)]: { x: 170, y: 441 },
  [checklistKey("RAMP UP", 7)]: { x: 170, y: 411 },
  [checklistKey("RAMP UP", 8)]: { x: 170, y: 381 },
  [checklistKey("RAMP UP", 9)]: { x: 170, y: 350 },
  [checklistKey("RAMP UP", 10)]: { x: 170, y: 320 },
  [checklistKey("RAMP UP", 11)]: { x: 170, y: 290 },
  [checklistKey("RAMP UP", 12)]: { x: 170, y: 260 },
  [checklistKey("RAMP UP", 13, 0)]: { x: 170, y: 230 },
  [checklistKey("RAMP UP", 13, 1)]: { x: 170, y: 200 },

  [checklistKey("RAMP DOWN [2]", 1)]: { x: 302, y: 592 },
  [checklistKey("RAMP DOWN [2]", 2)]: { x: 302, y: 562 },
  [checklistKey("RAMP DOWN [2]", 3)]: { x: 302, y: 531 },
  [checklistKey("RAMP DOWN [2]", 4)]: { x: 302, y: 501 },
  [checklistKey("RAMP DOWN [2]", 5)]: { x: 302, y: 471 },
  [checklistKey("RAMP DOWN [2]", 6)]: { x: 302, y: 441 },
  [checklistKey("RAMP DOWN [2]", 7)]: { x: 302, y: 411 },
  [checklistKey("RAMP DOWN [2]", 8)]: { x: 302, y: 381 },
  [checklistKey("RAMP DOWN [2]", 9)]: { x: 302, y: 350 },
  [checklistKey("RAMP DOWN [2]", 10)]: { x: 302, y: 320 },
  [checklistKey("RAMP DOWN [2]", 11)]: { x: 302, y: 290 },

  [checklistKey("ROAD TEST & FINAL CHECKS", 1)]: { x: 434, y: 592 },
  [checklistKey("ROAD TEST & FINAL CHECKS", 2)]: { x: 434, y: 562 },
  [checklistKey("ROAD TEST & FINAL CHECKS", 3)]: { x: 434, y: 531 },
  [checklistKey("ROAD TEST & FINAL CHECKS", 4)]: { x: 434, y: 501 },
  [checklistKey("ROAD TEST & FINAL CHECKS", 5)]: { x: 434, y: 471 },
  [checklistKey("ROAD TEST & FINAL CHECKS", 6)]: { x: 434, y: 441 },
  [checklistKey("ROAD TEST & FINAL CHECKS", 7)]: { x: 434, y: 411 },
};

export async function buildPdiPdf(bikeInput: SupabaseStockBike, payload: PdiFormPayload) {
  const bike = normalizeSupabaseStockBike(bikeInput);
  const templateBytes = await readFile(templatePath);
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPage(0);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const checklist = payload.checklist?.length ? payload.checklist : defaultPdiChecklist;

  const bikeName = [bike.make, bike.model, bike.variant].filter(Boolean).join(" ");
  fitText(page, bold, bikeName, 165, 721, 160, 6);
  fitText(page, bold, bike.vin || "", 165, 701, 160, 6);
  fitText(page, bold, bike.engine_number || "", 430, 701, 120, 6);
  fitText(page, bold, bike.registration || "", 165, 681, 110, 6);
  fitText(page, bold, new Date().toLocaleDateString("en-GB"), 430, 681, 80, 6);

  const seen = new Map<string, number>();
  for (const item of checklist) {
    if (!item.checked) continue;
    const baseKey = `${item.section}:${item.number}`;
    const occurrence = seen.get(baseKey) ?? 0;
    seen.set(baseKey, occurrence + 1);
    const position = checkboxPositions[checklistKey(item.section, item.number, occurrence)];
    if (position) drawTick(page, position.x, position.y, 7);
  }

  await drawDealerStamp(pdf, page);
  drawTick(page, 39, 146, 8);
  drawTick(page, 39, 85, 8);
  fitText(page, regular, payload.technicianName, 430, 126, 120, 8);
  fitText(page, regular, payload.customerName || "", 430, 65, 120, 8);
  await drawSignature(pdf, page, payload.signatureDataUrl, 166, 110, 154, 26);
  await drawSignature(pdf, page, payload.customerSignatureDataUrl, 166, 39, 154, 26);

  return pdf.save();
}
