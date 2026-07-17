import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";

const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const activeStatuses = new Set(["In Stock", "ON FORECOURT", "Available", "Prep", "Reserved"]);
const soldStatuses = new Set(["Sold", "Sale Completed"]);
const pendingStatus = "Purchase Pending";

export type LedgerRow = ReturnType<typeof toLedgerRow>;

export async function getStockLedgerData(options: { includeTest?: boolean } = {}) {
  const { data, error } = await getSupabaseAdmin().from("stock_bikes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const rows = ((data ?? []) as SupabaseStockBike[]).map(toLedgerRow).filter(row => options.includeTest || !row.isTestRecord);
  return {
    rows,
    kpis: buildKpis(rows),
    reports: buildReports(rows),
    charts: buildCharts(rows),
  };
}

export async function getStockLedgerBike(id: string) {
  const { data, error } = await getSupabaseAdmin().from("stock_bikes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toLedgerRow(data as SupabaseStockBike) : null;
}

function toLedgerRow(bike: SupabaseStockBike) {
  const status = bike.status || "";
  const purchaseDate = bike.purchase_date || bike.purchase_agreed_at?.slice(0, 10) || bike.date_in_stock || bike.created_at?.slice(0, 10) || null;
  const inStockDate = bike.date_in_stock || bike.actual_arrival_date || purchaseDate;
  const saleDate = bike.sold_date || (soldStatuses.has(status) ? bike.updated_at?.slice(0, 10) : null);
  const daysInStock = activeStatuses.has(status) ? daysBetween(inStockDate, new Date()) : soldStatuses.has(status) ? (bike.sold_days_held ?? daysBetween(inStockDate, saleDate)) : null;
  const granularCosts = money(bike.workshop_cost) + money(bike.parts_cost) + money(bike.labour_cost) + money(bike.valeting_cost) + money(bike.photography_cost) + money(bike.hpi_cost) + money(bike.miscellaneous_cost);
  const estimatedCosts = money(bike.estimated_preparation_cost) + money(bike.estimated_transport_cost) + money(bike.other_estimated_costs) + granularCosts;
  const actualCosts = money(bike.actual_preparation_cost) + money(bike.actual_transport_cost) + money(bike.other_actual_costs) + granularCosts;
  const purchasePrice = money(bike.purchase_price);
  const advertisedPrice = money(bike.price);
  const targetRetail = money(bike.target_retail_price) || advertisedPrice;
  const totalInvestment = status === pendingStatus ? purchasePrice + estimatedCosts : purchasePrice + actualCosts;
  const expectedGrossProfit = targetRetail - (purchasePrice + estimatedCosts);
  const expectedNetProfit = expectedGrossProfit;
  const salePrice = money(bike.sold_sale_price) || money(bike.actual_sale_price);
  const actualGrossProfit = money(bike.sold_gross_profit) || (salePrice ? salePrice - totalInvestment : 0);
  const actualNetProfit = money(bike.sold_net_profit) || actualGrossProfit;
  const margin = soldStatuses.has(status) ? actualGrossProfit : expectedGrossProfit;
  const profitPercent = totalInvestment > 0 ? (margin / totalInvestment) * 100 : null;
  const age = daysInStock ?? (status === pendingStatus ? daysBetween(purchaseDate, new Date()) : null);
  const alerts = [
    margin < 0 ? "Negative margin" : "",
    purchasePrice <= 0 ? "Missing purchase price" : "",
    targetRetail <= 0 && advertisedPrice <= 0 ? "Missing retail price" : "",
    margin > 0 && margin < 500 ? "Profit below target" : "",
    activeStatuses.has(status) && age != null && age > 180 ? "Bike over 180 days" : "",
    activeStatuses.has(status) && age != null && age > 90 ? "Bike over 90 days" : "",
    status === pendingStatus && age != null && age > 14 ? "Purchase Pending over 14 days" : "",
    status === pendingStatus && !bike.expected_arrival_date ? "Purchase Pending with no arrival date" : "",
  ].filter(Boolean);
  return {
    id: bike.id,
    stockNumber: bike.stock_number,
    registration: bike.registration,
    make: bike.make,
    model: bike.model,
    year: bike.year,
    status,
    purchaseDate,
    seller: bike.seller_name,
    source: bike.purchase_source,
    purchasePrice,
    deposit: money(bike.deposit_paid),
    balance: money(bike.balance_outstanding),
    preparationCosts: money(bike.estimated_preparation_cost) + money(bike.actual_preparation_cost),
    workshopCost: money(bike.workshop_cost),
    partsCost: money(bike.parts_cost),
    labourCost: money(bike.labour_cost),
    transportCosts: money(bike.estimated_transport_cost) + money(bike.actual_transport_cost),
    valetingCost: money(bike.valeting_cost),
    photographyCost: money(bike.photography_cost),
    hpiCost: money(bike.hpi_cost),
    miscellaneousCost: money(bike.miscellaneous_cost) + money(bike.other_estimated_costs) + money(bike.other_actual_costs),
    totalInvestment,
    advertisedPrice,
    targetRetail,
    currentRetailPrice: advertisedPrice || targetRetail,
    agreedSalePrice: salePrice,
    discountGiven: money(bike.discount_given),
    expectedGrossProfit,
    expectedNetProfit,
    actualGrossProfit,
    actualNetProfit,
    margin,
    profitPercent,
    daysInStock,
    ageDays: age,
    currentDepartment: department(bike),
    assignedStaff: bike.customer_name || null,
    websiteLive: Boolean(bike.show_on_website),
    dealer5Synced: Boolean(bike.dealer5_updated_at),
    dateInStock: bike.date_in_stock,
    soldDate: saleDate,
    expectedArrivalDate: bike.expected_arrival_date,
    soldSnapshotAt: bike.sold_finance_snapshot_at,
    alerts,
    raw: bike,
    isTestRecord: Boolean((bike as SupabaseStockBike & { is_test_record?: boolean }).is_test_record),
  };
}

function department(bike: SupabaseStockBike) {
  if (bike.status === pendingStatus) return "Purchase Pending";
  if (bike.workshop_status && bike.workshop_status !== "completed") return "Workshop";
  if (bike.valeting_status && bike.valeting_status !== "completed") return "Valeting";
  if (bike.photo_status && bike.photo_status !== "completed") return "Photos";
  return "Sales";
}

function daysBetween(start: string | null | undefined, end: string | Date | null | undefined) {
  if (!start || !end) return null;
  const a = new Date(start);
  const b = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

function sum(rows: LedgerRow[], key: keyof LedgerRow) {
  return rows.reduce((total, row) => total + money(row[key]), 0);
}

function buildKpis(rows: LedgerRow[]) {
  const current = rows.filter(row => activeStatuses.has(row.status));
  const pending = rows.filter(row => row.status === pendingStatus);
  const sold = rows.filter(row => soldStatuses.has(row.status));
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const year = now.getFullYear();
  const soldThisMonth = sold.filter(row => row.soldDate?.startsWith(month));
  const soldThisYear = sold.filter(row => row.soldDate && new Date(row.soldDate).getFullYear() === year);
  const ages = current.map(row => row.daysInStock).filter((value): value is number => typeof value === "number");
  return {
    currentStockCost: sum(current, "totalInvestment"),
    purchasePendingCost: sum(pending, "totalInvestment"),
    totalCapitalCommitted: sum([...current, ...pending], "totalInvestment"),
    expectedRetailValue: sum([...current, ...pending], "targetRetail"),
    expectedGrossProfit: sum([...current, ...pending], "expectedGrossProfit"),
    expectedNetProfit: sum([...current, ...pending], "expectedNetProfit"),
    bikesInStock: current.length,
    purchasePendingCount: pending.length,
    averageDaysInStock: average(ages),
    averageProfitPerBike: average(current.map(row => row.expectedGrossProfit)),
    bikesOver30Days: current.filter(row => (row.daysInStock ?? 0) > 30).length,
    bikesOver60Days: current.filter(row => (row.daysInStock ?? 0) > 60).length,
    bikesOver90Days: current.filter(row => (row.daysInStock ?? 0) > 90).length,
    soldThisMonth: soldThisMonth.length,
    profitThisMonth: sum(soldThisMonth, "actualNetProfit"),
    profitThisYear: sum(soldThisYear, "actualNetProfit"),
  };
}

function buildReports(rows: LedgerRow[]) {
  const sold = rows.filter(row => soldStatuses.has(row.status));
  const month = new Date().toISOString().slice(0, 7);
  const monthlyPurchases = rows.filter(row => row.purchaseDate?.startsWith(month)).length;
  const monthlySales = sold.filter(row => row.soldDate?.startsWith(month)).length;
  const monthlyProfit = sum(sold.filter(row => row.soldDate?.startsWith(month)), "actualNetProfit");
  const soldWithDays = sold.filter(row => typeof row.daysInStock === "number");
  const byMake = groupProfit(sold, "make");
  const byModel = groupProfit(sold, "model");
  return {
    monthlyPurchases,
    monthlySales,
    monthlyProfit,
    averageDaysToSell: average(soldWithDays.map(row => row.daysInStock as number)),
    fastestSellingBike: soldWithDays.sort((a, b) => (a.daysInStock ?? 0) - (b.daysInStock ?? 0))[0] ?? null,
    highestProfitBike: [...sold].sort((a, b) => b.actualNetProfit - a.actualNetProfit)[0] ?? null,
    lowestProfitBike: [...sold].sort((a, b) => a.actualNetProfit - b.actualNetProfit)[0] ?? null,
    mostProfitableMake: byMake[0] ?? null,
    mostProfitableModel: byModel[0] ?? null,
  };
}

function buildCharts(rows: LedgerRow[]) {
  const sold = rows.filter(row => soldStatuses.has(row.status));
  return {
    capitalOverTime: monthly(rows, "purchaseDate", "totalInvestment"),
    monthlyProfit: monthly(sold, "soldDate", "actualNetProfit"),
    monthlyPurchases: monthlyCount(rows, "purchaseDate"),
    monthlySales: monthlyCount(sold, "soldDate"),
    stockAgeing: [
      { label: "0-30", value: rows.filter(row => activeStatuses.has(row.status) && (row.daysInStock ?? 0) <= 30).length },
      { label: "31-60", value: rows.filter(row => activeStatuses.has(row.status) && (row.daysInStock ?? 0) > 30 && (row.daysInStock ?? 0) <= 60).length },
      { label: "61-90", value: rows.filter(row => activeStatuses.has(row.status) && (row.daysInStock ?? 0) > 60 && (row.daysInStock ?? 0) <= 90).length },
      { label: "90+", value: rows.filter(row => activeStatuses.has(row.status) && (row.daysInStock ?? 0) > 90).length },
    ],
    profitByMake: groupProfit(sold, "make").slice(0, 8),
    profitByModel: groupProfit(sold, "model").slice(0, 8),
  };
}

function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function monthKey(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "";
}

function monthly(rows: LedgerRow[], dateKey: keyof LedgerRow, valueKey: keyof LedgerRow) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = monthKey(row[dateKey] as string | null);
    if (key) map.set(key, (map.get(key) ?? 0) + money(row[valueKey]));
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([label, value]) => ({ label, value }));
}

function monthlyCount(rows: LedgerRow[], dateKey: keyof LedgerRow) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = monthKey(row[dateKey] as string | null);
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([label, value]) => ({ label, value }));
}

function groupProfit(rows: LedgerRow[], key: "make" | "model") {
  const map = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[key] ?? "Unknown");
    map.set(label, (map.get(label) ?? 0) + row.actualNetProfit);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}

export function ledgerCsv(rows: LedgerRow[]) {
  const columns: [string, keyof LedgerRow][] = [
    ["Stock Number", "stockNumber"], ["Registration", "registration"], ["Make", "make"], ["Model", "model"], ["Year", "year"], ["Status", "status"], ["Purchase Date", "purchaseDate"], ["Purchase Price", "purchasePrice"], ["Total Investment", "totalInvestment"], ["Advertised Price", "advertisedPrice"], ["Target Retail", "targetRetail"], ["Margin", "margin"], ["Profit %", "profitPercent"], ["Days In Stock", "daysInStock"], ["Website Live", "websiteLive"], ["Dealer5 Synced", "dealer5Synced"],
  ];
  return [columns.map(([label]) => label).join(","), ...rows.map(row => columns.map(([, key]) => csvCell(row[key])).join(","))].join("\n");
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const ledgerStatusSets = { activeStatuses, soldStatuses, pendingStatus };
