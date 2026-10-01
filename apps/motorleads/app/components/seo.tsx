import Link from "next/link";
import { absoluteUrl } from "../site";

type JsonLdValue = Record<string, unknown> | Record<string, unknown>[];

export function JsonLd({ data }: { data: JsonLdValue }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  const trail = [{ name: "Home", path: "/" }, ...items];
  const structured = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path)
    }))
  };

  return <>
    <JsonLd data={structured} />
    <nav className="ml-breadcrumbs ml-shell" aria-label="Breadcrumb">
      {trail.map((item, index) => <span key={item.path}>
        {index < trail.length - 1 ? <Link href={item.path}>{item.name}</Link> : <span aria-current="page">{item.name}</span>}
        {index < trail.length - 1 && <b aria-hidden="true">/</b>}
      </span>)}
    </nav>
  </>;
}
