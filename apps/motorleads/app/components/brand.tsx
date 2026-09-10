import Link from "next/link";
import { site } from "../site";

export function MotorGeeksLogo() {
  return <Link className="ml-logo" href="/" aria-label="MotorGeeks home">
    <img src={site.assets.lockupDark} alt="MotorGeeks" />
  </Link>;
}

export function MotorGeeksTick() {
  return <svg className="ml-soft-tick" viewBox="0 0 52 42" aria-hidden="true" focusable="false">
    <path d="M5 22.5c6.2 7.3 9.8 11.2 11.1 11.2 1.2 0 4-4 9.4-10.1C31 17.3 37.7 10 47 5" />
  </svg>;
}
