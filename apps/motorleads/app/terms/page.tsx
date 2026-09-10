import type { Metadata } from "next";
import { LegalPage } from "../components/legal";
import { absoluteUrl } from "../site";

export const metadata: Metadata = { title: "Terms & Conditions", description: "Draft MotorGeeks terms for owner and legal review.", alternates: { canonical: absoluteUrl("/terms") } };

export default function TermsPage() {
  return <LegalPage title="Terms & Conditions" intro="These draft terms describe the intended V1 MotorGeeks public website and enquiry service. They require owner and legal review before being treated as final terms." sections={[
    {
      title: "About MotorGeeks",
      body: [
        "MotorGeeks helps motorcycle owners provide useful motorcycle details and contact information so suitable motorcycle dealers can review relevant opportunities.",
        "The V1 service is an enquiry and introduction service. It does not guarantee a valuation, offer, sale, collection, finance settlement or purchase."
      ]
    },
    {
      title: "Using the website",
      body: [
        "You agree to provide accurate information and not misuse the website, submit malicious content, impersonate another person or interfere with the service.",
        "Submitting a motorcycle or dealer enquiry does not create an automatic account, contract, dealer appointment or obligation for MotorGeeks to progress the enquiry."
      ]
    },
    {
      title: "Motorcycle information",
      body: [
        "Motorcycle owners are responsible for checking that the details they provide are accurate, including registration, mileage, ownership, condition, history, finance and photographs.",
        "Dealers may rely on the information supplied when deciding whether to make contact, inspect the motorcycle or discuss a purchase."
      ]
    },
    {
      title: "Dealer access",
      body: [
        "Dealer access requests are reviewed by MotorGeeks. Access may be refused, paused or withdrawn where appropriate.",
        "Approved dealers are responsible for their own purchase decisions, offers, checks, collection arrangements and communications with sellers."
      ]
    },
    {
      title: "No obligation",
      body: [
        "Motorcycle owners are not obliged to accept an offer or proceed with a dealer. Dealers are not obliged to make an offer or purchase a motorcycle.",
        "Any sale terms, payment, collection and handover arrangements are agreed between the seller and dealer unless MotorGeeks separately confirms otherwise in writing."
      ]
    },
    {
      title: "Liability and changes",
      body: [
        "MotorGeeks aims to keep the website available and accurate, but availability and content may change. Legal wording should confirm the final liability position before launch.",
        "These terms may be updated as the service develops. The public version should show the terms that apply at the time of use."
      ]
    }
  ]} />;
}
