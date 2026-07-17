"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AddressLookup, type AddressValue } from "@/components/common/AddressLookup";
import { CustomerLocationMap } from "@/components/maps/CustomerLocationMap";
import { InvoiceWorkflowStep } from "./invoice-workflow-step";

type Customer = {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  house_name_number: string | null;
  street: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  address_line_3: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  customer_status?: string | null;
  tags?: string[] | null;
  notes?: string | null;
};

type Bike = {
  id: number;
  registration: string | null;
  vin: string | null;
  stock_number: string | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  mileage: number | null;
  price: number | null;
  status: string;
  primary_image_url: string | null;
};

type Address = {
  id: string;
  label: string;
  house: string;
  street: string;
  line1: string;
  line2: string;
  town: string;
  county: string;
  postcode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
};

type DuplicateCustomer = Pick<Customer, "id" | "title" | "first_name" | "last_name" | "email" | "phone" | "alternate_phone" | "postcode" | "address_line_1" | "city" | "customer_status">;

const steps = ["Customer", "Lead", "Motorcycle", "Reserve & deposit", "Finance & sale", "Invoice & payment", "Delivery", "Complete"];
const blankAddress: AddressValue = {
  buildingNumber: "",
  buildingName: "",
  addressLine1: "",
  addressLine2: "",
  addressLine3: "",
  town: "",
  county: "",
  postcode: "",
  country: "United Kingdom",
  latitude: null,
  longitude: null,
};

function addressFromCustomer(customer?: Customer): AddressValue {
  if (!customer) return blankAddress;
  return {
    buildingNumber: customer.house_name_number ?? "",
    buildingName: "",
    addressLine1: customer.address_line_1 ?? "",
    addressLine2: customer.address_line_2 ?? "",
    addressLine3: "",
    town: customer.city ?? "",
    county: customer.county ?? "",
    postcode: customer.postcode ?? "",
    country: customer.country ?? "United Kingdom",
    latitude: customer.latitude,
    longitude: customer.longitude,
  };
}

export function SalesWizard({
  customers,
  stock,
  defaultCustomer = "",
  defaultBike = "",
}: {
  customers: Customer[];
  stock: Bike[];
  defaultCustomer?: string;
  defaultBike?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState(defaultCustomer);
  const [leadId, setLeadId] = useState("");
  const [bikeId, setBikeId] = useState(defaultBike);
  const [reservationId, setReservationId] = useState("");
  const [saleId, setSaleId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [finance, setFinance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [postcode, setPostcode] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressBusy, setAddressBusy] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<Customer[]>(customers);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerCreateBusy, setCustomerCreateBusy] = useState(false);
  const [customerCreateError, setCustomerCreateError] = useState("");
  const [duplicateCustomers, setDuplicateCustomers] = useState<DuplicateCustomer[]>([]);
  const [wizardAddress, setWizardAddress] = useState<AddressValue>(() =>
    addressFromCustomer(customers.find((item) => item.id === defaultCustomer)),
  );
  const [reservationExpiryDefault] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));

  const customer = customerOptions.find((item) => item.id === customerId);
  const bike = stock.find((item) => String(item.id) === bikeId);
  const searchStock = useMemo(() => stock, [stock]);

  useEffect(() => {
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setCustomerSearchBusy(true);
      try {
        const response = await fetch(`/api/crm/customers?q=${encodeURIComponent(customerSearch)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as { customers?: Customer[] };
        if (response.ok) {
          const rows = result.customers ?? [];
          setCustomerOptions((current) => {
            const selected = current.find((item) => item.id === customerId);
            return selected && !rows.some((item) => item.id === selected.id) ? [selected, ...rows] : rows;
          });
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Unable to search customers.");
      } finally {
        if (!controller.signal.aborted) setCustomerSearchBusy(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [customerSearch, customerId]);

  async function call(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/crm/sales-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as Record<string, unknown>;
    setBusy(false);
    if (!response.ok) {
      setError(String(result.error || "Unable to continue."));
      throw new Error(String(result.error));
    }
    return result;
  }

  function chooseCustomer(nextId: string) {
    setCustomerId(nextId);
    setWizardAddress(addressFromCustomer(customerOptions.find((item) => item.id === nextId)));
  }

  async function submitCustomerForm(form: HTMLFormElement, allowPossibleDuplicate = false) {
    setCustomerCreateBusy(true);
    setCustomerCreateError("");
    setDuplicateCustomers([]);

    const response = await fetch("/api/crm/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), allow_possible_duplicate: allowPossibleDuplicate }),
    });
    const result = (await response.json()) as { customer?: Customer; duplicates?: DuplicateCustomer[]; error?: string };
    setCustomerCreateBusy(false);

    if (!response.ok || !result.customer) {
      setCustomerCreateError(result.error || "Unable to create customer.");
      setDuplicateCustomers(result.duplicates ?? []);
      return;
    }

    setCustomerOptions((current) => [result.customer!, ...current.filter((item) => item.id !== result.customer!.id)]);
    setCustomerId(result.customer.id);
    setWizardAddress(addressFromCustomer(result.customer));
    setShowCustomerForm(false);
    form.reset();
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCustomerForm(event.currentTarget);
  }

  async function lookupAddress() {
    if (!postcode.trim()) return;
    setAddressBusy(true);
    setError("");
    const response = await fetch(`/api/postcode-lookup?postcode=${encodeURIComponent(postcode)}`);
    const result = (await response.json()) as { addresses?: Address[]; error?: string };
    setAddressBusy(false);
    if (!response.ok) {
      setError(result.error || "Postcode not found.");
      return;
    }
    setAddresses(result.addresses ?? []);
  }

  async function chooseAddress(address: Address) {
    if (!customerId) return;
    setBusy(true);
    const response = await fetch(`/api/crm/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        house_name_number: address.house,
        street: address.street,
        address_line_1: address.line1,
        address_line_2: address.line2,
        city: address.town,
        county: address.county,
        postcode: address.postcode,
        country: address.country,
        latitude: address.latitude,
        longitude: address.longitude,
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error || "Unable to save address.");
      return;
    }
    setAddresses([]);
    router.refresh();
  }

  async function saveWizardAddress(next: AddressValue) {
    setWizardAddress(next);
    if (!customerId) return;
    const response = await fetch(`/api/crm/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        house_name_number: [next.buildingNumber, next.buildingName].filter(Boolean).join(" "),
        address_line_1: next.addressLine1,
        address_line_2: next.addressLine2,
        address_line_3: next.addressLine3,
        city: next.town,
        county: next.county,
        postcode: next.postcode,
        country: next.country,
        latitude: next.latitude,
        longitude: next.longitude,
      }),
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error || "Unable to save customer address.");
    }
  }

  return (
    <div className="sales-wizard">
      <nav className="sales-progress">
        {steps.map((label, index) => (
          <div className={index === step ? "active" : index < step ? "done" : ""} key={label}>
            <i>{index < step ? "Done" : index + 1}</i>
            <span>{label}</span>
          </div>
        ))}
      </nav>

      {error && <p className="stock-save-message">{error}</p>}

      <section className="sales-step">
        {step === 0 && customer && (
          <div className="wizard-shared-address">
            <AddressLookup value={wizardAddress} onChange={(next) => void saveWizardAddress(next)} />
            {wizardAddress.latitude != null && wizardAddress.longitude != null && (
              <CustomerLocationMap
                latitude={wizardAddress.latitude}
                longitude={wizardAddress.longitude}
                address={[wizardAddress.addressLine1, wizardAddress.town, wizardAddress.postcode].filter(Boolean).join(", ")}
              />
            )}
          </div>
        )}

        {step === 0 && (
          <>
            <h2>Select customer</h2>
            <p>Choose the customer purchasing the motorcycle.</p>
            <div className="customer-search-tool">
              <input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Search customer name, email, phone or postcode"
              />
              <button type="button" onClick={() => setShowCustomerForm(true)}>
                Add New Customer
              </button>
            </div>
            <label>
              <span>Customer</span>
              <select value={customerId} onChange={(event) => chooseCustomer(event.target.value)}>
                <option value="">{customerSearchBusy ? "Searching..." : "Select existing customer..."}</option>
                {customerOptions.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.last_name}, {item.first_name} - {item.email || item.phone || item.postcode || "No contact"}
                  </option>
                ))}
              </select>
            </label>
            {customer && (
              <div className="wizard-customer">
                <b>
                  {customer.first_name} {customer.last_name}
                </b>
                <span>
                  {customer.email} - {customer.phone}
                </span>
                <span>{[customer.address_line_1, customer.city, customer.postcode].filter(Boolean).join(", ") || "Address not recorded"}</span>
              </div>
            )}
            <div className="postcode-tool">
              <input value={postcode} onChange={(event) => setPostcode(event.target.value.toUpperCase())} placeholder="UK postcode" />
              <button type="button" onClick={lookupAddress} disabled={addressBusy || !customerId}>
                {addressBusy ? "Looking..." : "Find address"}
              </button>
            </div>
            {addresses.length > 0 && (
              <div className="address-results">
                {addresses.map((address) => (
                  <button type="button" onClick={() => chooseAddress(address)} key={address.id}>
                    {address.label}
                  </button>
                ))}
              </div>
            )}
            {customer?.latitude && customer.longitude && (
              <iframe
                className="address-map"
                title="Customer address map"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${customer.longitude - 0.01}%2C${customer.latitude - 0.006}%2C${customer.longitude + 0.01}%2C${customer.latitude + 0.006}&layer=mapnik&marker=${customer.latitude}%2C${customer.longitude}`}
              />
            )}
            <WizardActions next={() => setStep(1)} disabled={!customerId} />
          </>
        )}

        {showCustomerForm && (
          <div className="sales-modal-backdrop" role="dialog" aria-modal="true" aria-label="Add new customer">
            <form className="sales-modal stock-editor-panel crm-form" onSubmit={createCustomer}>
              <header>
                <div>
                  <h2>Add New Customer</h2>
                  <p>Create the customer without leaving this sale.</p>
                </div>
                <button type="button" onClick={() => setShowCustomerForm(false)}>
                  Close
                </button>
              </header>

              {customerCreateError && <p className="stock-save-message">{customerCreateError}</p>}

              {duplicateCustomers.length > 0 && (
                <div className="crm-setup">
                  <b>Possible duplicate customer</b>
                  <span>Select the existing customer below, or continue only if this is genuinely a separate person.</span>
                  <div className="customer-duplicate-actions">
                    {duplicateCustomers.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          const existing = item as Customer;
                          setCustomerOptions((current) => [existing, ...current.filter((row) => row.id !== item.id)]);
                          setCustomerId(item.id);
                          setWizardAddress(addressFromCustomer(existing));
                          setShowCustomerForm(false);
                        }}
                      >
                        {item.first_name} {item.last_name} - {item.email || item.phone || item.postcode || "Existing customer"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="stock-form-grid">
                <label>
                  <span>Title</span>
                  <input name="title" />
                </label>
                <label>
                  <span>First name</span>
                  <input name="first_name" required />
                </label>
                <label>
                  <span>Last name</span>
                  <input name="last_name" required />
                </label>
                <label>
                  <span>Email</span>
                  <input name="email" type="email" />
                </label>
                <label>
                  <span>Mobile</span>
                  <input name="phone" type="tel" />
                </label>
                <label>
                  <span>Telephone</span>
                  <input name="alternate_phone" type="tel" />
                </label>
                <label>
                  <span>Address line 1</span>
                  <input name="address_line_1" />
                </label>
                <label>
                  <span>Address line 2</span>
                  <input name="address_line_2" />
                </label>
                <label>
                  <span>Town/City</span>
                  <input name="city" />
                </label>
                <label>
                  <span>County</span>
                  <input name="county" />
                </label>
                <label>
                  <span>Postcode</span>
                  <input name="postcode" />
                </label>
                <label>
                  <span>Customer type</span>
                  <select name="customer_type" defaultValue="Retail">
                    <option>Retail</option>
                    <option>Trade</option>
                    <option>Supplier</option>
                  </select>
                </label>
                <label>
                  <span>Source</span>
                  <select name="source" defaultValue="Manual">
                    <option>Manual</option>
                    <option>Website</option>
                    <option>Phone</option>
                    <option>Walk-in</option>
                    <option>AutoTrader</option>
                    <option>Facebook</option>
                    <option>Email</option>
                  </select>
                </label>
                <label className="full">
                  <span>Notes</span>
                  <textarea name="notes" rows={4} />
                </label>
                <div className="full delivery-checks">
                  <label>
                    <input type="checkbox" name="marketing_email" /> Email consent
                  </label>
                  <label>
                    <input type="checkbox" name="marketing_sms" /> SMS consent
                  </label>
                  <label>
                    <input type="checkbox" name="marketing_phone" /> Phone consent
                  </label>
                  <label>
                    <input type="checkbox" name="marketing_whatsapp" /> WhatsApp consent
                  </label>
                </div>
              </div>

              <div className="crm-form-actions">
                {duplicateCustomers.length > 0 && (
                  <button type="button" onClick={(event) => event.currentTarget.form && void submitCustomerForm(event.currentTarget.form, true)} disabled={customerCreateBusy}>
                    Create Separate Customer
                  </button>
                )}
                <button className="admin-primary" disabled={customerCreateBusy}>
                  {customerCreateBusy ? "Creating..." : "Create and Select Customer"}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 1 && (
          <>
            <h2>Create linked lead</h2>
            <p>This preserves the sales opportunity and customer timeline.</p>
            <label>
              <span>Lead notes</span>
              <textarea id="lead-notes" rows={5} placeholder="Customer requirements, budget or part exchange..." />
            </label>
            <WizardActions
              back={() => setStep(0)}
              next={async () => {
                const result = await call({
                  action: "createLead",
                  customer_id: customerId,
                  notes: (document.getElementById("lead-notes") as HTMLTextAreaElement)?.value,
                });
                setLeadId(String(result.leadId));
                setStep(2);
              }}
              disabled={busy}
            />
          </>
        )}

        {step === 2 && (
          <>
            <h2>Assign motorcycle</h2>
            <p>Only currently available stock is shown.</p>
            <div className="wizard-bike-grid">
              {searchStock.map((item) => (
                <button
                  type="button"
                  className={bikeId === String(item.id) ? "selected" : ""}
                  onClick={() => setBikeId(String(item.id))}
                  key={item.id}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {item.primary_image_url && <img src={item.primary_image_url} alt="" />}
                  <span>
                    <b>
                      {item.year} {item.make} {item.model}
                    </b>
                    <small>
                      {item.registration} - {item.mileage?.toLocaleString("en-GB")} miles
                    </small>
                    <strong>GBP {Number(item.price || 0).toLocaleString("en-GB")}</strong>
                  </span>
                </button>
              ))}
            </div>
            <WizardActions
              back={() => setStep(1)}
              next={async () => {
                await call({ action: "assignBike", lead_id: leadId, stock_bike_id: bikeId });
                setStep(3);
              }}
              disabled={!bikeId || busy}
            />
          </>
        )}

        {step === 3 && (
          <WizardForm
            title="Reserve motorcycle"
            submit={async (form) => {
              const result = await call({ action: "reserve", customer_id: customerId, lead_id: leadId, stock_bike_id: bikeId, ...form });
              setReservationId(String(result.reservationId));
              setStep(4);
            }}
            back={() => setStep(2)}
            busy={busy}
          >
            <Field name="deposit_amount" label="Deposit amount" type="number" defaultValue="99" />
            <Field name="expires_at" label="Reservation expiry" type="datetime-local" defaultValue={reservationExpiryDefault} />
            <Select name="method" label="Deposit method" options={["Card", "Cash", "Bank", "Finance Deposit"]} />
            <Field name="receipt_number" label="Receipt number" />
            <Area name="notes" label="Reservation notes" />
          </WizardForm>
        )}

        {step === 4 && (
          <WizardForm
            title="Finance and create sale"
            submit={async (form) => {
              const result = await call({ action: "convertSale", reservation_id: reservationId, customer_id: customerId, stock_bike_id: bikeId, finance, ...form });
              setSaleId(String(result.saleId));
              setInvoiceId(String(result.invoiceId ?? ""));
              setStep(5);
            }}
            back={() => setStep(3)}
            busy={busy}
          >
            <label className="wizard-check">
              <input type="checkbox" checked={finance} onChange={(event) => setFinance(event.target.checked)} /> Customer is using finance
            </label>
            {finance && (
              <>
                <Field name="lender" label="Lender" />
                <Field name="term_months" label="Term (months)" type="number" />
                <Field name="apr" label="APR" type="number" />
                <Field name="finance_deposit" label="Finance deposit" type="number" />
                <Field name="monthly_payment" label="Monthly payment" type="number" />
                <Select name="finance_status" label="Status" options={["Draft", "Submitted", "Referred", "Approved"]} />
              </>
            )}
          </WizardForm>
        )}

        {step === 5 && (
          <InvoiceWorkflowStep
            saleId={saleId}
            invoiceId={invoiceId}
            busy={busy}
            back={() => setStep(4)}
            completePayment={async (form) => {
              await call({ action: "payment", sale_id: saleId, customer_id: customerId, stock_bike_id: bikeId, ...form });
              setStep(6);
            }}
          />
        )}

        {step === 6 && (
          <WizardForm
            title="Delivery checklist"
            submit={async (form) => {
              await call({ action: "delivery", sale_id: saleId, ...form, complete: true });
              setStep(7);
            }}
            back={() => setStep(5)}
            busy={busy}
          >
            <Select name="delivery_method" label="Handover method" options={["Collection", "Nationwide Delivery"]} />
            <Field name="scheduled_at" label="Scheduled date" type="datetime-local" />
            <div className="delivery-checks">
              {[
                ["identity_checked", "Identity checked"],
                ["licence_verified", "Licence verified"],
                ["v5_prepared", "V5 prepared"],
                ["handover_completed", "Handover completed"],
                ["keys_given", "Keys given"],
                ["documents_signed", "Documents signed"],
                ["photos_taken", "Photos taken"],
                ["hpi_complete", "HPI complete"],
              ].map(([name, label]) => (
                <label key={name}>
                  <input type="checkbox" name={name} />
                  {label}
                </label>
              ))}
            </div>
            <Field name="fuel_level" label="Fuel level" />
            <Area name="notes" label="Delivery notes" />
          </WizardForm>
        )}

        {step === 7 && (
          <div className="wizard-complete">
            <i>Done</i>
            <h2>Sale completed</h2>
            <p>
              {customer?.first_name} {customer?.last_name} is now recorded as the owner of the {bike?.make} {bike?.model}. Stock, lead,
              reservation, invoice, payment and delivery records are linked.
            </p>
            <button onClick={() => router.push(`/admin/customers/${customerId}`)}>View customer timeline</button>
          </div>
        )}
      </section>
    </div>
  );
}

function WizardActions({ back, next, disabled }: { back?: () => void; next: () => void | Promise<void>; disabled?: boolean }) {
  return (
    <div className="wizard-actions">
      {back && (
        <button type="button" onClick={back}>
          Back
        </button>
      )}
      <button className="primary" type="button" disabled={disabled} onClick={() => void next()}>
        Continue
      </button>
    </div>
  );
}

function WizardForm({
  title,
  children,
  submit,
  back,
  busy,
}: {
  title: string;
  children: ReactNode;
  submit: (data: Record<string, unknown>) => Promise<void>;
  back: () => void;
  busy: boolean;
}) {
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget));
    event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
      data[input.name] = input.checked;
    });
    await submit(data);
  }

  return (
    <form onSubmit={handle}>
      <h2>{title}</h2>
      <div className="wizard-form-grid">{children}</div>
      <div className="wizard-actions">
        <button type="button" onClick={back}>
          Back
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "Saving..." : "Save and continue"}
        </button>
      </div>
    </form>
  );
}

function Field({ name, label, type = "text", defaultValue }: { name: string; label: string; type?: string; defaultValue?: string }) {
  return (
    <label>
      <span>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} />
    </label>
  );
}

function Area({ name, label }: { name: string; label: string }) {
  return (
    <label className="full">
      <span>{label}</span>
      <textarea name={name} rows={4} />
    </label>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: string[] }) {
  return (
    <label>
      <span>{label}</span>
      <select name={name}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
