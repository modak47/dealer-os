"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineReservation, SalesDeal } from "@/lib/sales-deals";

const columns = [
  { key: "Reservation", title: "Reservations", statuses: ["Reservation"] },
  { key: "Sale Pending", title: "Sale Pending", statuses: ["Sale Pending", "Awaiting Payment", "Sale Agreed"] },
  { key: "Finance", title: "Finance", statuses: ["Finance"] },
  { key: "Sold", title: "Sold / Handover", statuses: ["Sold", "Delivery"] },
  { key: "Sale Completed", title: "Completed", statuses: ["Sale Completed", "Completed"] },
  { key: "Cancelled", title: "Cancelled", statuses: ["Cancelled"] },
];

export function SalesPipeline({ deals, reservations }: { deals: SalesDeal[]; reservations: PipelineReservation[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return deals.filter(deal => {
      const haystack = [deal.invoice_number, deal.status, customerName(deal), bikeName(deal), deal.bike?.registration, deal.payment_status, deal.finance_status].join(" ").toLowerCase();
      return (!term || haystack.includes(term)) && (stage === "all" || deal.status === stage);
    });
  }, [deals, query, stage]);

  const filteredReservations = useMemo(() => {
    const term = query.trim().toLowerCase();
    return reservations.filter(reservation => {
      const haystack = [reservation.status, customerName(reservation), bikeName(reservation), reservation.bike?.registration].join(" ").toLowerCase();
      return (!term || haystack.includes(term)) && (stage === "all" || stage === "Reservation");
    });
  }, [reservations, query, stage]);

  async function convertReservation(reservation: PipelineReservation) {
    setBusy(reservation.id);
    setMessage("");
    const response = await fetch("/api/crm/sales-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "convertSale", reservation_id: reservation.id, finance: false }),
    });
    const result = await response.json() as { saleId?: string; error?: string };
    setBusy("");
    if (!response.ok || !result.saleId) {
      setMessage(result.error || "Unable to convert reservation.");
      return;
    }
    router.push(`/admin/sales/${result.saleId}`);
  }

  return <section className="sales-pipeline">
    <div className="sales-pipeline-toolbar">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search customer, bike, reg, invoice..." />
      <select value={stage} onChange={event => setStage(event.target.value)}>
        <option value="all">All stages</option>
        <option value="Reservation">Reservations</option>
        <option>Sale Pending</option>
        <option>Sold</option>
        <option>Sale Completed</option>
        <option>Awaiting Payment</option>
        <option>Finance</option>
        <option>Delivery</option>
        <option>Completed</option>
        <option>Cancelled</option>
      </select>
    </div>
    {message && <p className="invoice-error">{message}</p>}
    <div className="sales-pipeline-board">
      {columns.map(column => {
        const columnReservations = column.key === "Reservation" ? filteredReservations : [];
        const columnDeals = filtered.filter(deal => column.statuses.includes(deal.status));
        return <section className="sales-pipeline-column" key={column.key}>
          <header><h2>{column.title}</h2><span>{columnReservations.length + columnDeals.length}</span></header>
          <div>
            {columnReservations.map(reservation => <article className="sales-deal-card reservation" key={reservation.id}>
              <DealCardHead image={reservation.bike?.primary_image_url} title={bikeName(reservation)} sub={reservation.bike?.registration || "Registration pending"} />
              <div className="sales-deal-meta">
                <span>{customerName(reservation)}</span>
                <b>{money(reservation.bike?.price)}</b>
                <small>Deposit {money(reservation.deposit_amount)}</small>
              </div>
              <footer>
                <button type="button" onClick={() => void convertReservation(reservation)} disabled={busy === reservation.id}>{busy === reservation.id ? "Converting..." : "Create Sale"}</button>
                <Link href={`/admin/customers/${reservation.customer?.id}`}>Customer</Link>
              </footer>
            </article>)}
            {columnDeals.map(deal => <DealCard deal={deal} key={deal.id} />)}
            {!columnReservations.length && !columnDeals.length && <p className="sales-pipeline-empty">Nothing here.</p>}
          </div>
        </section>;
      })}
    </div>
  </section>;
}

function DealCard({ deal }: { deal: SalesDeal }) {
  const invoice = Array.isArray(deal.invoice) ? deal.invoice[0] : null;
  const delivery = Array.isArray(deal.delivery) ? deal.delivery[0] : null;
  const checklist = delivery ? [delivery.identity_checked, delivery.licence_verified, delivery.v5_prepared, delivery.handover_completed, delivery.keys_given, delivery.documents_signed, delivery.hpi_complete].filter(Boolean).length : 0;
  return <article className="sales-deal-card">
    <DealCardHead image={deal.bike?.primary_image_url} title={bikeName(deal)} sub={deal.bike?.registration || deal.invoice_number || "Deal"} />
    <div className="sales-deal-meta">
      <span>{customerName(deal)}</span>
      <b>{money(deal.sale_price ?? deal.bike?.price)}</b>
      <small>{deal.payment_status || "Payment unknown"} · Balance {money(deal.balance_due ?? invoice?.balance)}</small>
      <small>{deal.finance_status || "Finance not set"} · Handover {checklist}/7</small>
    </div>
    <footer>
      <Link href={`/admin/sales/${deal.id}`}>View Deal</Link>
      {invoice && <Link href={`/admin/accounts/invoices/${invoice.id}/document`} target="_blank">Invoice</Link>}
      {deal.bike?.id && <Link href={`/admin/stock/${deal.bike.id}`}>Vehicle</Link>}
    </footer>
  </article>;
}

function DealCardHead({ image, title, sub }: { image?: string | null; title: string; sub: string }) {
  return <div className="sales-deal-head">
    <div className="sales-deal-thumb" style={{ backgroundImage: `url("${image || "/bike-placeholder.svg"}")` }} aria-hidden="true" />
    <div><h3>{title}</h3><p>{sub}</p></div>
  </div>;
}

function bikeName(deal: SalesDeal | PipelineReservation) {
  return [deal.bike?.year, deal.bike?.make, deal.bike?.model, deal.bike?.variant].filter(Boolean).join(" ") || "Motorcycle";
}

function customerName(deal: SalesDeal | PipelineReservation) {
  return [deal.customer?.first_name, deal.customer?.last_name].filter(Boolean).join(" ") || "Customer";
}

function money(value: unknown) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number.isFinite(number) ? number : 0);
}
