import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { normalizeSupabaseStockBike } from "@/lib/supabase-stock";
import { defaultPdiChecklist, pdiSections, type PdiFormPayload } from "@/lib/stock-pdi-types";

const safe = (value: unknown) => String(value ?? "")
  .replace(/[\u2610\u25A1]/g, "[ ]")
  .replace(/[\u2611\u2713\u2714]/g, "X")
  .replace(/[\u2010-\u2015]/g, "-")
  .replace(/\u00A3/g, "GBP ")
  .replace(/[^\x20-\x7E]/g, " ");
const tick = "X";

function drawText(page: PDFPage, value: unknown, options: NonNullable<Parameters<PDFPage["drawText"]>[1]>) {
  page.drawText(safe(value), options);
}

function wrap(text: string, maxChars: number) {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    const logo = await readFile(path.join(process.cwd(), "public", "yesmoto-logo.png"));
    return await pdf.embedPng(logo);
  } catch {
    return null;
  }
}

function drawBoxText(page: PDFPage, text: string, x: number, y: number, width: number, height: number, font: PDFFont, size = 8) {
  const lines = wrap(text, Math.max(12, Math.floor(width / (size * 0.48))));
  lines.forEach((line, index) => drawText(page, line, { x, y: y + height - 12 - index * (size + 2), size, font, color: rgb(0.04, 0.06, 0.07) }));
}

function drawSignature(pdf: PDFDocument, page: PDFPage, dataUrl: string | undefined, x: number, y: number, width: number, height: number) {
  if (!dataUrl?.startsWith("data:image/png;base64,")) return;
  try {
    return pdf.embedPng(Buffer.from(dataUrl.split(",")[1], "base64")).then((image) => {
      page.drawImage(image, { x: x + 6, y: y + 5, width: width - 12, height: height - 10 });
    });
  } catch {
    return Promise.resolve();
  }
}

export async function buildPdiPdf(bikeInput: SupabaseStockBike, payload: PdiFormPayload) {
  const bike = normalizeSupabaseStockBike(bikeInput);
  const checklist = payload.checklist?.length ? payload.checklist : defaultPdiChecklist;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);
  const page = pdf.addPage([595, 842]);
  const black = rgb(0.02, 0.02, 0.02);
  const green = rgb(0, 0.78, 0.12);
  const lightGrey = rgb(0.94, 0.95, 0.94);
  const border = rgb(0.1, 0.12, 0.13);

  if (logo) page.drawImage(logo, { x: 398, y: 756, width: 150, height: 50 });
  drawText(page, "SELL YOUR MOTORBIKE LTD T/A YES MOTO", { x: 34, y: 798, size: 10, font: bold, color: black });
  drawText(page, "72 Brentwood Road", { x: 34, y: 784, size: 8, font: regular, color: black });
  drawText(page, "Brighton BN1 7ES", { x: 34, y: 772, size: 8, font: regular, color: black });
  drawText(page, "Tel: 07984 763470", { x: 34, y: 760, size: 8, font: regular, color: black });
  drawText(page, "www.yesmoto.co.uk", { x: 34, y: 748, size: 8, font: regular, color: black });
  page.drawRectangle({ x: 34, y: 715, width: 527, height: 24, color: black });
  drawText(page, "USED BIKE PRE-DELIVERY INSPECTION [PDI] SHEET", { x: 146, y: 722, size: 12, font: bold, color: rgb(1, 1, 1) });

  const vehicleY = 650;
  const labelW = 118;
  const valueW = 145;
  const rowH = 25;
  const detailRows = [
    ["BIKE MAKE & MODEL", [bike.make, bike.model, bike.variant].filter(Boolean).join(" ")],
    ["VEHICLE ID. [VIN]", bike.vin || "", "ENGINE NO.", bike.engine_number || ""],
    ["REG NO.", bike.registration || "", "DATE.", new Date().toLocaleDateString("en-GB")],
  ];
  for (let r = 0; r < 3; r++) {
    const y = vehicleY + (2 - r) * rowH;
    const row = detailRows[r];
    const xs = [34, 34 + labelW, 34 + labelW + valueW, 34 + labelW * 2 + valueW];
    const ws = [labelW, valueW, labelW, valueW];
    for (let c = 0; c < 4; c++) {
      page.drawRectangle({ x: xs[c], y, width: ws[c], height: rowH, borderColor: border, borderWidth: 0.8, color: c % 2 === 0 ? lightGrey : rgb(1, 1, 1) });
    }
    drawText(page, row[0] || "", { x: xs[0] + 5, y: y + 9, size: 7, font: bold, color: black });
    drawText(page, safe(row[1]).slice(0, 30), { x: xs[1] + 5, y: y + 8, size: 8, font: bold, color: black });
    if (row[2]) {
      drawText(page, row[2], { x: xs[2] + 5, y: y + 9, size: 7, font: bold, color: black });
      drawText(page, safe(row[3]).slice(0, 24), { x: xs[3] + 5, y: y + 8, size: 8, font: bold, color: black });
    }
  }

  const warning = "VISUALLY INSPECT THE BIKE FOR MISSING PARTS. CHECK TYRES, CHAIN & SPROCKETS AND BRAKE PAD CONDITION BEFORE CARRYING OUT PDI, REPORT IF ANYTHING NEEDS REPLACING TO PARTS DEPARTMENT";
  drawText(page, warning.slice(0, 130), { x: 34, y: 630, size: 6.4, font: bold, color: black });
  drawText(page, "TTS = TORQUE TO SPEC", { x: 34, y: 618, size: 7, font: bold, color: green });

  const gridTop = 592;
  const colW = 527 / 4;
  const headH = 22;
  const rowHeight = 29;
  const maxRows = Math.max(...pdiSections.map((section) => checklist.filter((item) => item.section === section).length));
  pdiSections.forEach((section, col) => {
    const x = 34 + col * colW;
    page.drawRectangle({ x, y: gridTop, width: colW, height: headH, color: black, borderColor: border, borderWidth: 0.8 });
    drawText(page, section, { x: x + 5, y: gridTop + 7, size: 7.4, font: bold, color: rgb(1, 1, 1) });
    const items = checklist.filter((item) => item.section === section);
    for (let row = 0; row < maxRows; row++) {
      const y = gridTop - (row + 1) * rowHeight;
      const item = items[row];
      page.drawRectangle({ x, y, width: colW, height: rowHeight, borderColor: border, borderWidth: 0.5, color: rgb(1, 1, 1) });
      if (!item) continue;
      page.drawRectangle({ x: x + 4, y: y + 8, width: 10, height: 10, borderColor: black, borderWidth: 0.6 });
      if (item.checked) drawText(page, tick, { x: x + 6, y: y + 9, size: 8, font: bold, color: green });
      drawText(page, String(item.number), { x: x + 19, y: y + 16, size: 7, font: bold, color: black });
      if (/dealer stamp/i.test(item.label) && logo) {
        page.drawImage(logo, { x: x + 35, y: y + 5, width: 70, height: 18 });
      } else {
        drawBoxText(page, item.label.toUpperCase(), x + 33, y + 3, colW - 36, rowHeight - 4, regular, 6.2);
      }
    }
  });

  const notesY = 132;
  drawText(page, "TECHNICIAN NOTES", { x: 34, y: notesY + 45, size: 8, font: bold, color: green });
  page.drawRectangle({ x: 34, y: notesY, width: 527, height: 40, borderColor: border, borderWidth: 0.6 });
  const notes = checklist.filter((item) => item.notes).map((item) => `${item.number}. ${item.label}: ${item.notes}`).join(" | ");
  drawBoxText(page, notes || "No technician notes recorded.", 40, notesY + 2, 515, 36, regular, 7);

  drawText(page, "DEALER DECLARATION: I hereby declare that all pre-delivery checks have been completed.", { x: 34, y: 116, size: 7.5, font: bold, color: black });
  if (logo) page.drawImage(logo, { x: 442, y: 100, width: 95, height: 32 });

  const fields = [
    ["TECHNICIAN SIGNATURE", "", 34, 78],
    ["PRINT NAME", payload.technicianName, 200, 78],
    ["CUSTOMER SIGNATURE", "", 34, 28],
    ["PRINT NAME", payload.customerName || "", 200, 28],
    ["DATE", new Date().toLocaleDateString("en-GB"), 432, 78],
    ["DATE", "", 432, 28],
  ] as const;
  for (const [label, value, x, y] of fields) {
    const w = x === 432 ? 129 : 156;
    page.drawRectangle({ x, y, width: w, height: 28, borderColor: border, borderWidth: 0.6, color: value ? lightGrey : rgb(1, 1, 1) });
    drawText(page, label, { x: x + 4, y: y + 17, size: 6.5, font: bold, color: black });
    if (value) drawText(page, safe(value).slice(0, 24), { x: x + 4, y: y + 6, size: 8, font: bold, color: black });
  }
  await drawSignature(pdf, page, payload.signatureDataUrl, 38, 80, 148, 22);
  await drawSignature(pdf, page, payload.customerSignatureDataUrl, 38, 30, 148, 22);

  drawText(page, "PURCHASER ACCEPTANCE: I have inspected the machine on collection/delivery and it meets with my satisfaction. I have been advised on operation, routine servicing and safety precautions.", { x: 34, y: 18, size: 6.4, font: regular, color: black });
  return pdf.save();
}
