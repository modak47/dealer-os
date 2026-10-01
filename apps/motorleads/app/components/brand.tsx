"use client";

import Image from "next/image";
import { site } from "../site";

export function MotorGeeksLogo() {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname !== "/") return;
    event.preventDefault();
    window.history.replaceState(null, "", "/");
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    root.scrollTop = 0;
    document.body.scrollTop = 0;
    window.requestAnimationFrame(() => {
      root.style.scrollBehavior = previousScrollBehavior;
    });
  };

  // A document navigation prevents Next.js from restoring the homepage's previous scroll position.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a className="ml-logo" href="/#motorgeeks-home" aria-label="MotorGeeks home" onClick={handleClick}>
    <Image src={site.assets.lockupDark} alt="MotorGeeks" width={1128} height={221} preload sizes="(max-width: 760px) 198px, 285px" />
  </a>;
}

export function MotorGeeksTick() {
  return <svg className="ml-soft-tick" viewBox="0 0 52 42" aria-hidden="true" focusable="false">
    <path d="M5 22.5c6.2 7.3 9.8 11.2 11.1 11.2 1.2 0 4-4 9.4-10.1C31 17.3 37.7 10 47 5" />
  </svg>;
}
