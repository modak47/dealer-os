import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MotorGeeks Dealer Portal",
  description: "MotorGeeks dealer login and opportunities portal.",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-icon.png",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
