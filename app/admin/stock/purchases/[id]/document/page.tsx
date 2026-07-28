import { dateText, getPurchaseDocument, lineValues, moneyFromPence } from "@/lib/purchase-document";
import { PurchaseDocumentActions } from "./document-actions";

export const dynamic = "force-dynamic";

export default async function PurchaseDocument({ params }: { params: Promise<{ id: string }> }) {
  const d = await getPurchaseDocument((await params).id);
  const sellerAddress = lineValues(d.supplier?.address_line_1, d.supplier?.address_line_2, d.supplier?.town, d.supplier?.county, d.supplier?.postcode);
  const amount = moneyFromPence(d.purchase.purchase_price_pence);
  const registration = String(d.bike.registration ?? "");
  const vin = String(d.bike.vin ?? "");
  const supplierEmail = String(d.supplier?.email ?? "");
  const supplierPhone = String(d.supplier?.phone ?? "");
  const mileage = String(d.bike.mileage ?? "");
  const colour = String(d.bike.colour ?? "");
  const notes = String(d.purchase.notes ?? "");

  return <main className="invoice-document-page">
    <PurchaseDocumentActions stockId={d.bike.id} />
    <article className="invoice-document purchase-document">
      <header><img src="/yesmoto-logo.png" alt={d.settings.business_name} /><div><span>Purchase invoice</span><h1>{d.documentNumber}</h1></div></header>
      <section className="invoice-document-meta"><div><small>Purchase date</small><b>{dateText(d.purchase.purchase_date)}</b></div><div><small>Stock number</small><b>{String(d.bike.stock_number ?? d.bike.id ?? "")}</b></div><div><small>Payment status</small><b>{String(d.purchase.payment_status ?? "unpaid").replaceAll("_", " ")}</b></div></section>
      <section className="invoice-addresses"><div><small>Purchased from</small><h2>{d.sellerName}</h2>{sellerAddress.map(line => <p key={line}>{line}</p>)}{supplierEmail && <p>{supplierEmail}</p>}{supplierPhone && <p>{supplierPhone}</p>}</div><div><small>Purchased by</small><h2>{d.settings.trading_name}</h2><p>{d.dealerAddress}</p><p>{d.settings.phone}</p><p>{d.settings.email}</p>{d.settings.company_number && <p>Company no: {d.settings.company_number}</p>}{d.settings.vat_number && <p>VAT no: {d.settings.vat_number}</p>}</div></section>
      <section className="invoice-bike"><small>Motorcycle</small><h2>{d.bikeName}</h2><p>{[registration && `Registration: ${registration}`, vin && `VIN: ${vin}`, mileage && `Mileage: ${mileage}`, colour && `Colour: ${colour}`].filter(Boolean).join(" | ")}</p></section>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody><tr><td>{d.bikeName}{registration ? ` (${registration})` : ""}</td><td>1</td><td>{amount}</td><td>{amount}</td></tr></tbody></table>
      <section className="invoice-totals"><div><span>Purchase price</span><b>{amount}</b></div><div><span>Payment method</span><b>{String(d.purchase.payment_method ?? "Not recorded")}</b></div><div className="balance"><span>Total purchase amount</span><strong>{amount}</strong></div></section>
      <section className="invoice-payment-instructions"><h2>Declaration</h2><p>This document records the purchase of the motorcycle shown above by {d.settings.trading_name} from the seller named on this document.</p><p>Reference: {String(d.purchase.reference ?? d.documentNumber)}</p>{notes && <p>Notes: {notes}</p>}</section>
      <section className="purchase-signatures"><div><small>Seller signature</small></div><div><small>YesMoto signature</small></div></section>
      <footer><b>{d.settings.invoice_footer}</b><span>{d.settings.website} | {d.settings.phone} | {d.settings.email}</span></footer>
    </article>
  </main>;
}
