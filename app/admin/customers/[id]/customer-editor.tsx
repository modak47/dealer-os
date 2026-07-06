"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AddressLookup, type AddressValue } from "@/components/common/AddressLookup";

type EditableCustomer = {
  id: string; first_name: string; last_name: string; email: string | null; phone: string | null;
  house_name_number?: string | null; address_line_1?: string | null; address_line_2?: string | null;
  address_line_3?: string | null; city?: string | null; county?: string | null; postcode: string | null;
  country?: string | null; latitude?: number | null; longitude?: number | null; notes: string | null;
};

export function CustomerEditor({ customer }: { customer: EditableCustomer }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [address, setAddress] = useState<AddressValue>({
    buildingNumber: customer.house_name_number ?? "", buildingName: "",
    addressLine1: customer.address_line_1 ?? "", addressLine2: customer.address_line_2 ?? "",
    addressLine3: customer.address_line_3 ?? "", town: customer.city ?? "", county: customer.county ?? "",
    postcode: customer.postcode ?? "", country: customer.country ?? "United Kingdom",
    latitude: customer.latitude ?? null, longitude: customer.longitude ?? null,
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/crm/customers/${customer.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(form), house_name_number: address.buildingNumber,
        address_line_1: address.addressLine1, address_line_2: address.addressLine2,
        address_line_3: address.addressLine3, city: address.town, county: address.county,
        postcode: address.postcode, country: address.country, latitude: address.latitude, longitude: address.longitude }),
    });
    const result = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) { setMessage(result.error || "Unable to update customer."); return; }
    setMessage("Customer details saved."); router.refresh();
  }

  return <section className="customer-editor">
    <button type="button" className="admin-primary" onClick={() => setOpen(value => !value)}>{open ? "Close editor" : "Edit customer"}</button>
    {open && <form className="stock-editor-panel crm-form" onSubmit={save}>
      <div className="stock-form-grid">
        <label><span>First name</span><input name="first_name" defaultValue={customer.first_name} required /></label>
        <label><span>Last name</span><input name="last_name" defaultValue={customer.last_name} required /></label>
        <label><span>Email</span><input name="email" type="email" defaultValue={customer.email ?? ""} /></label>
        <label><span>Phone</span><input name="phone" type="tel" defaultValue={customer.phone ?? ""} /></label>
        <div className="full"><AddressLookup value={address} onChange={setAddress} /></div>
        <label className="full"><span>Customer notes</span><textarea name="notes" rows={5} defaultValue={customer.notes ?? ""} /></label>
      </div>
      {message && <p className="stock-save-message">{message}</p>}
      <div className="crm-form-actions"><button className="admin-primary" disabled={saving}>{saving ? "Saving…" : "Save customer details"}</button></div>
    </form>}
  </section>;
}
