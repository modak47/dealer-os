import { LegalPage } from "../components/legal";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Cookie Policy", "How MotorGeeks uses essential browser storage and cookies across the public website and secure seller journey.", "/cookies");

export default function CookiesPage() {
  return <LegalPage title="Cookies" intro="This notice explains how MotorGeeks uses essential cookies and similar browser technologies." sections={[
    {
      title: "What cookies are",
      body: [
        "Cookies are small files or similar browser storage technologies used to make websites work, remember limited information and understand technical activity."
      ]
    },
    {
      title: "Essential cookies",
      body: [
        "MotorGeeks uses essential cookies to keep your saved answers and sign-in working, and to help keep the website secure.",
        "These are used only where needed to provide the website and protect it from misuse."
      ]
    },
    {
      title: "Analytics and marketing cookies",
      body: [
        "We do not currently use optional analytics or advertising cookies.",
        "If we introduce optional cookies, we will update this notice and ask for consent where required."
      ]
    },
    {
      title: "Managing cookies",
      body: [
        "You can control cookies through your browser settings. Blocking essential cookies may affect how some forms or website features work.",
        "For questions about cookies, contact MotorGeeks through the contact page."
      ]
    }
  ]} />;
}
