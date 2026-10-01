import { LegalPage } from "../components/legal";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Privacy Policy", "How MotorGeeks handles personal information for motorcycle sellers, dealers and website visitors.", "/privacy");

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" intro="This policy explains how MotorGeeks handles personal information when you use our website, submit a motorcycle or apply for dealer access." sections={[
    {
      title: "Information we collect",
      body: [
        "When you contact MotorGeeks or request dealer access, we may collect your name, email address, telephone number, postcode, dealership name, website and any message you choose to send.",
        "When a motorcycle owner starts a valuation or enquiry, we may collect motorcycle details, registration, mileage, condition, photographs, seller comments and contact details needed to handle the enquiry."
      ]
    },
    {
      title: "How we use information",
      body: [
        "We use information to respond to enquiries, review dealer access requests, operate the MotorGeeks service, understand motorcycle opportunities and help route suitable seller enquiries to appropriate motorcycle dealers.",
        "We may use technical information such as browser, device, security and server log data to keep the website working, prevent misuse and improve reliability."
      ]
    },
    {
      title: "Sharing information",
      body: [
        "Where a seller uses MotorGeeks, relevant motorcycle and opportunity information may be shared with selected motorcycle dealers. Seller contact details are made available only to the dealer whose offer the seller accepts.",
        "We do not sell personal information for unrelated marketing. We may share information with service providers who help us run the website, email delivery, hosting, security or business administration."
      ]
    },
    {
      title: "Cookies and technical data",
      body: [
        "The website may use essential cookies or similar technologies needed for security, performance, forms and normal website operation.",
        "If analytics, advertising or optional tracking tools are added later, this policy and the cookie notice should be updated before those tools are enabled."
      ]
    },
    {
      title: "Retention and deletion",
      body: [
        "We keep enquiry information only for as long as reasonably needed to respond, operate the service, maintain records and meet legal or accounting obligations.",
        "You can ask us to review, correct or delete personal information where applicable. Some information may need to be retained where required for legal, fraud-prevention, audit or legitimate business reasons."
      ]
    },
    {
      title: "Contact",
      body: [
        "For privacy questions, data requests or concerns, contact MotorGeeks using the contact form on this website or email info@motorgeeks.co.uk."
      ]
    }
  ]} />;
}
