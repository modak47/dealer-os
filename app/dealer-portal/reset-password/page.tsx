import type { Metadata } from "next";
import { DealerPasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Set your MotorGeeks password", robots: { index: false, follow: false } };

export default function DealerPasswordPage() {
  return <DealerPasswordForm />;
}
