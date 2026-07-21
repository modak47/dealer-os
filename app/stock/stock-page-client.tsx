"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicStockBike } from "@/lib/stock";
import { matchesPublicStyle, PUBLIC_STYLES } from "@/lib/public-stock-filters";
import { compareImageAvailability } from "@/lib/stock-images";

const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
type InitialFilters = Record<string, string | undefined>;

export function StockPageClient({ bikes, initial }: { bikes: PublicStockBike[]; initial: InitialFilters }) {
  const [query, setQuery] = useState(initial.q ?? "");
  const [make, setMake] = useState(initial.make ?? "");
  const [model, setModel] = useState(initial.model ?? "");
  const [minPrice, setMinPrice] = useState(Number(initial.min) || 0);
  const [maxPrice, setMaxPrice] = useState(Number(initial.max) || 0);
  const [style, setStyle] = useState(initial.category ?? "");
  const [engine, setEngine] = useState(initial.engine ?? "");
  const [maxMileage, setMaxMileage] = useState(Number(initial.mileage) || 0);
  const [sort, setSort] = useState(initial.sort ?? "newest");
  const makes = [...new Set(bikes.map((bike) => bike.make).filter(Boolean))].sort();
  const models = [...new Set(bikes.filter((bike) => !make || bike.make === make).map((bike) => bike.model).filter(Boolean))].sort();
  const bodyTypes = [...new Set(bikes.map((bike) => bike.bodyStyle || bike.category).filter(Boolean))].sort();
  const imageCompare = (a: PublicStockBike, b: PublicStockBike) => compareImageAvailability(a.photoReady, b.photoReady);
  const newestCompare = (a: PublicStockBike, b: PublicStockBike) => Date.parse(b.createdTime || "0") - Date.parse(a.createdTime || "0");
  const shown = useMemo(() => bikes.filter((bike) => {
    const text = `${bike.make} ${bike.model} ${bike.variant} ${bike.bodyStyle} ${bike.category} ${bike.description}`.toLowerCase();
    const styleMatch = !style || (PUBLIC_STYLES as readonly string[]).includes(style) ? !style || matchesPublicStyle(bike, style) : `${bike.bodyStyle} ${bike.category}`.toLowerCase().includes(style.toLowerCase());
    const engineMatch = !engine || (engine === "125" && bike.engineCc >= 110 && bike.engineCc <= 140) || (engine === "under500" && bike.engineCc > 0 && bike.engineCc < 500) || (engine === "500plus" && bike.engineCc >= 500);
    return (!query || text.includes(query.toLowerCase())) && (!make || bike.make === make) && (!model || bike.model === model) && (!minPrice || bike.price >= minPrice) && (!maxPrice || bike.price <= maxPrice) && styleMatch && engineMatch && (!maxMileage || bike.mileageValue <= maxMileage);
  }).sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price || imageCompare(a, b) || newestCompare(a, b);
    if (sort === "price-desc") return b.price - a.price || imageCompare(a, b) || newestCompare(a, b);
    if (sort === "year") return b.year - a.year || imageCompare(a, b) || newestCompare(a, b);
    if (sort === "mileage") return a.mileageValue - b.mileageValue || imageCompare(a, b) || newestCompare(a, b);
    return imageCompare(a, b) || newestCompare(a, b);
  }), [bikes, query, make, model, minPrice, maxPrice, style, engine, maxMileage, sort]);
  const clear = () => { setQuery(""); setMake(""); setModel(""); setMinPrice(0); setMaxPrice(0); setStyle(""); setEngine(""); setMaxMileage(0); };
  return (
    <>
      <section className="stock-page-hero premium-stock-hero"><div className="wide"><p>YESMOTO USED MOTORCYCLES</p><h1>FIND YOUR NEXT BIKE</h1><span>Carefully selected, honestly described and professionally prepared in Brighton.</span></div></section>
      <div className="stock-page wide">
        <section className="public-stock-filters">
          <div className="stock-filter-heading"><div><p>SEARCH OUR STOCK</p><h2>{shown.length} motorcycle{shown.length === 1 ? "" : "s"} available</h2></div><button type="button" onClick={clear}>Clear filters</button></div>
          <div className="stock-filter-grid">
            <label className="search"><span>Keyword</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Make, model or keyword" /></label>
            <Filter label="Make" value={make} onChange={(value) => { setMake(value); setModel(""); }} options={makes} />
            <Filter label="Model" value={model} onChange={setModel} options={models} />
            <Filter label="Style / body type" value={style} onChange={setStyle} options={[...PUBLIC_STYLES, ...bodyTypes.filter((value) => !(PUBLIC_STYLES as readonly string[]).includes(value))]} />
            <Filter label="Engine" value={engine} onChange={setEngine} custom={[["125", "125cc"], ["under500", "Under 500cc"], ["500plus", "500cc and above"]]} />
            <Filter label="Minimum price" value={String(minPrice || "")} onChange={(value) => setMinPrice(Number(value))} custom={[["3000", "£3,000"], ["5000", "£5,000"], ["7500", "£7,500"]]} />
            <Filter label="Maximum price" value={String(maxPrice || "")} onChange={(value) => setMaxPrice(Number(value))} custom={[["5000", "£5,000"], ["7500", "£7,500"], ["10000", "£10,000"], ["15000", "£15,000"]]} />
            <Filter label="Maximum mileage" value={String(maxMileage || "")} onChange={(value) => setMaxMileage(Number(value))} custom={[["5000", "5,000 miles"], ["10000", "10,000 miles"], ["20000", "20,000 miles"]]} />
          </div>
        </section>
        <div className="public-results-bar"><span>Showing {shown.length} of {bikes.length} motorcycles</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest stock</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="year">Newest year</option><option value="mileage">Lowest mileage</option></select></div>
        {shown.length === 0 ? <div className="stock-state"><b>No motorcycles match</b><span>Clear a filter or try a broader search.</span><button type="button" onClick={clear}>Show all motorcycles</button></div> : <div className="public-stock-grid">{shown.map((bike) => <PublicStockCard bike={bike} key={bike.id} />)}</div>}
      </div>
    </>
  );
}

function Filter({ label, value, onChange, options = [], custom = [] }: { label: string; value: string; onChange: (value: string) => void; options?: string[]; custom?: string[][] }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Any</option>{custom.map(([value, label]) => <option value={value} key={value}>{label}</option>)}{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
}

function StockImage({ bike }: { bike: PublicStockBike }) {
  const images = bike.imageUrls.length ? bike.imageUrls : [bike.image];
  const [index, setIndex] = useState(0);
  return (
    <>
      <img src={images[index]} alt={`${bike.make} ${bike.model}${bike.variant ? ` ${bike.variant}` : ""}`} onError={() => setIndex((current) => Math.min(current + 1, images.length - 1))} />
      {!bike.photoReady && <small className="photo-pending">Photos coming soon</small>}
    </>
  );
}

function PublicStockCard({ bike }: { bike: PublicStockBike }) {
  const [opening, setOpening] = useState(false);
  const specs = [bike.mileage, bike.engineCc > 0 ? `${bike.engineCc.toLocaleString("en-GB")}cc` : "", bike.bodyStyle || bike.category, bike.transmission].filter(Boolean);
  return <Link prefetch href={`/used-bikes/${bike.slug}`} onClick={() => setOpening(true)} className={`public-stock-card ${opening ? "opening" : ""}`}><div className="public-stock-image"><StockImage bike={bike} /><span className={bike.status === "Reserved" ? "reserved" : ""}>{bike.status}</span><b>{bike.photoReady ? `${bike.imageUrls.length} photos` : "Photos coming soon"}</b>{opening && <span className="bike-opening"><i />Opening bike...</span>}</div><div className="public-stock-copy"><p>{bike.year || "Year unavailable"}</p><h2>{bike.make} {bike.model}</h2>{bike.variant && <h3>{bike.variant}</h3>}<div className="public-stock-specs">{specs.map((spec) => <span key={spec}>{spec}</span>)}</div><div className="public-stock-finance"><span>Finance from approximately £{bike.monthly}/month</span><b>{bike.status === "Reserved" ? "Reserved" : "Reserve for £99"}</b></div><div className="public-stock-action"><strong>{money(bike.price)}</strong><b>View motorcycle →</b></div></div></Link>;
}
