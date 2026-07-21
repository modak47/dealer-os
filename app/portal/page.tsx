import type { Metadata } from "next";
import { CustomerPortalClient } from "./portal-client";

export const metadata: Metadata = {
  title: "Customer Portal",
  description: "View your YesMoto motorcycle reservation, invoice, payment details and delivery status.",
};

export default function PortalPage() {
  return <CustomerPortalClient />;
}
