"use client";

import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/mock-data";
import type { PublicStockBike } from "@/lib/stock";

function CardImage({ bike }: { bike: PublicStockBike }) {
  const images = bike.imageUrls.length ? bike.imageUrls : [bike.image];
  const [index, setIndex] = useState(0);
  return (
    <>
      <img
        src={images[index]}
        alt={`${bike.make} ${bike.model}`}
        onError={() => setIndex((current) => Math.min(current + 1, images.length - 1))}
      />
      {!bike.photoReady && <small className="photo-pending">Photos coming soon</small>}
    </>
  );
}

export function BikeCard({ bike }: { bike: PublicStockBike }) {
  const [opening, setOpening] = useState(false);
  return (
    <Link
      prefetch
      href={`/used-bikes/${bike.slug}`}
      onClick={() => setOpening(true)}
      className={`bike-card ${opening ? "opening" : ""}`}
      aria-label={`View ${bike.year} ${bike.make} ${bike.model}`}
    >
      <div className="bike-photo">
        <CardImage bike={bike} />
        <span className={bike.status === "Reserved" ? "badge red" : "badge"}>{bike.status}</span>
        {opening && <span className="bike-opening"><i />Opening bike...</span>}
      </div>
      <div className="bike-info">
        <h3>{bike.year} {bike.make} {bike.model}</h3>
        <p>{bike.mileage}</p>
        <div className="bike-price"><strong>{money(bike.price)}</strong><small>From £{bike.monthly}/month</small></div>
        <div className="bike-perks"><span>{bike.status === "Reserved" ? "Reserved" : bike.reserveEnabled ? "Reserve online" : "Enquire first"}</span><span>Enquire</span></div>
      </div>
    </Link>
  );
}
