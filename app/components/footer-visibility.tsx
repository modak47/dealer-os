"use client";

import { usePathname } from "next/navigation";

export function FooterVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/dealer-portal") || pathname === "/dealer-login-v4-preview") return null;
  return children;
}
