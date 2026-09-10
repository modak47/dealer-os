import type { Metadata } from "next";
import { LegalPage } from "../components/legal";
import { absoluteUrl } from "../site";

export const metadata: Metadata = { title: "Cookies", description: "Draft MotorGeeks cookie notice for owner and legal review.", alternates: { canonical: absoluteUrl("/cookies") } };

export default function CookiesPage() {
  return <LegalPage title="Cookies" intro="This draft cookie notice reflects the intended V1 MotorGeeks website. It should be reviewed before launch and updated if analytics, advertising or optional tracking tools are added." sections={[
    {
      title: "What cookies are",
      body: [
        "Cookies are small files or similar browser storage technologies used to make websites work, remember limited information and understand technical activity."
      ]
    },
    {
      title: "Essential cookies",
      body: [
        "MotorGeeks may use essential cookies or similar technologies needed for website security, routing, form operation and reliable delivery of the service.",
        "These are used only where needed to provide the website and protect it from misuse."
      ]
    },
    {
      title: "Analytics and marketing cookies",
      body: [
        "No optional analytics or advertising cookie provider should be enabled for V1 unless the business owner approves it and this notice is updated.",
        "If optional tracking is introduced later, the website should explain what is used and provide any consent controls required by law."
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
