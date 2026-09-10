"use client";

import { useEffect } from "react";

const motorgeeksSiteUrl = "https://motorgeeks.co.uk";

export default function PortalRoot() {
  useEffect(() => {
    window.location.replace(motorgeeksSiteUrl);
  }, []);

  return (
    <main className="portal-redirect">
      <a href={motorgeeksSiteUrl}>Back to MotorGeeks</a>
    </main>
  );
}
