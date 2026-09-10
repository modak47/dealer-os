type IconName = "pound" | "shield" | "network" | "users" | "lock" | "form" | "camera" | "handshake" | "tag" | "clock" | "pin" | "star" | "bike" | "mail" | "phone";

export function Icon({ name }: { name: IconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    {name === "pound" && <><circle cx="24" cy="24" r="18" {...common} /><path d="M29 16c-2-3-9-3-9 3v15m-5 0h17M16 25h12" {...common} /></>}
    {name === "shield" && <path d="M24 5l16 6v11c0 10-6.5 17-16 21C14.5 39 8 32 8 22V11l16-6zm-8 20l5 5 11-12" {...common} />}
    {name === "network" && <><circle cx="24" cy="14" r="5" {...common} /><circle cx="14" cy="31" r="5" {...common} /><circle cx="34" cy="31" r="5" {...common} /><path d="M21 18l-5 8m11-8l5 8m-13 5h10" {...common} /></>}
    {name === "users" && <><circle cx="24" cy="14" r="5.5" {...common} /><path d="M14 40c1-8.5 4.7-13 10-13s9 4.5 10 13" {...common} /><circle cx="12" cy="21" r="4.2" {...common} /><path d="M4.5 36c.8-6.3 3.5-9.6 7.7-9.6 2.4 0 4.3 1 5.7 2.9" {...common} /><circle cx="36" cy="21" r="4.2" {...common} /><path d="M30.1 29.3c1.4-1.9 3.3-2.9 5.7-2.9 4.2 0 6.9 3.3 7.7 9.6" {...common} /></>}
    {name === "lock" && <><rect x="11" y="21" width="26" height="18" rx="3" {...common} /><path d="M17 21v-6a7 7 0 0114 0v6m-7 8v4" {...common} /></>}
    {name === "form" && <><path d="M14 6h15l7 7v29H14zM29 6v8h7M19 22h14M19 29h14M19 36h9" {...common} /></>}
    {name === "camera" && <><path d="M14 16h6l3-4h7l3 4h5v22H10V16z" {...common} /><circle cx="24" cy="27" r="7" {...common} /></>}
    {name === "handshake" && <><path d="M6 10h13" {...common} /><path d="M42 10h-8" {...common} /><path d="M6 8 4 30l13 13c1.5 1.5 3.9 1.5 5.4 0" {...common} /><path d="M42 8l2 22h-4" {...common} /><path d="m18 36 4 4a2.8 2.8 0 0 0 4-4" {...common} /><path d="m22 32 5 5a2.8 2.8 0 0 0 4-4" {...common} /><path d="m26 28 5 5a2.8 2.8 0 0 0 4-4l-8-8" {...common} /><path d="m18 22 5-5c2.5-2.5 6.6-2.5 9.1 0l2.9 2.9" {...common} /><path d="m20 20-3 3a2.8 2.8 0 0 1-4-4l5.6-5.6c3.3-3.3 8.4-4 12.5-1.7l1.2.7c1.2.7 2.6.9 4 .6L42 12" {...common} /></>}
    {name === "tag" && <><path d="M8 25V10h15l17 17-15 15z" {...common} /><circle cx="17" cy="18" r="2" {...common} /></>}
    {name === "clock" && <><circle cx="24" cy="24" r="18" {...common} /><path d="M24 13v12l8 5" {...common} /></>}
    {name === "pin" && <><path d="M24 43s14-12 14-25A14 14 0 1010 18c0 13 14 25 14 25z" {...common} /><circle cx="24" cy="18" r="5" {...common} /></>}
    {name === "star" && <path d="M24 6l5.3 11 12 1.7-8.7 8.5 2 12-10.6-5.7-10.6 5.7 2-12-8.7-8.5 12-1.7z" {...common} />}
    {name === "bike" && <><circle cx="14" cy="33" r="6" {...common} /><circle cx="34" cy="33" r="6" {...common} /><path d="M14 33l8-13h6l6 13m-12-13l-4-5m10 5l4-5m-12 18h8" {...common} /></>}
    {name === "mail" && <><rect x="8" y="12" width="32" height="24" rx="3" {...common} /><path d="M10 15l14 12 14-12" {...common} /></>}
    {name === "phone" && <path d="M17 8l5 10-5 3c3 7 7 11 14 14l3-5 10 5-2 8c-20-1-35-16-36-36z" {...common} />}
  </svg>;
}
