export type IconType="bike"|"gear"|"colour"|"gauge"|"fuel"|"power"|"engine"|"leaf"|"calendar"|"tax"|"user"|"shield";

export function VehicleSpecIcon({type}:{type:IconType}){
  const common={viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,"aria-hidden":true};
  if(type==="gear")return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></svg>;
  if(type==="colour")return <svg {...common}><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a6 6 0 0 0-3-10z"/><circle cx="7" cy="10" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>;
  if(type==="gauge")return <svg {...common}><path d="M4 18a8 8 0 1 1 16 0M12 14l4-5M7 18h10"/></svg>;
  if(type==="fuel")return <svg {...common}><path d="M6 21V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v17M4 21h13M8 7h5M15 8h2l2 2v7a1.5 1.5 0 0 0 3 0v-6l-2-2"/></svg>;
  if(type==="power")return <svg {...common}><path d="M13 2 5 14h6l-1 8 8-12h-6z"/></svg>;
  if(type==="engine")return <svg {...common}><path d="M5 8h11l3 3v6H6l-2-3V9zM8 8V5h5v3M19 12h2v4h-2M3 11H1v4h3"/></svg>;
  if(type==="leaf")return <svg {...common}><path d="M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-8 10-16zM4 21c3-6 7-9 13-12"/></svg>;
  if(type==="calendar")return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>;
  if(type==="tax")return <svg {...common}><path d="M4 4h16v16H4zM8 8h8M8 12h5M8 16h3"/></svg>;
  if(type==="user")return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
  if(type==="shield")return <svg {...common}><path d="M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6zM9 12l2 2 4-5"/></svg>;
  return <svg {...common}><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="m6 17 4-7h4l4 7M9 17h6M10 10 8 7h3"/></svg>;
}
