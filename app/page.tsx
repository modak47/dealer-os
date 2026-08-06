import Link from "next/link";
import { dealership } from "@/config/dealership";
import { getPublicStockBikes, type PublicStockBike } from "@/lib/stock";
import { matchesPublicStyle, PUBLIC_STYLES } from "@/lib/public-stock-filters";
import { defaultHomepageSections, getWebsitePageByPath, type WebsitePageSection } from "@/lib/website-pages";
import { BikeCard } from "./components/bike-card";
import { Arrow, Pound, Search, Shield, StarIcon, Truck } from "./components/icons";
import { CategoryTile } from "./components/category-tile";

export const revalidate = 60;

const trustItems = [
  { icon: <StarIcon />, title: "Rated Excellent", text: "5-star customer reviews" },
  { icon: <Shield />, title: "Warranty Included", text: "Peace of mind" },
  { icon: <Search />, title: "120 Point Inspection", text: "Expertly checked" },
  { icon: <Truck />, title: "UK Nationwide Delivery", text: "Delivered to your door" },
  { icon: <Pound />, title: "Finance Available", text: "Tailored to you" },
];

const heroSlides = [
  "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=2400&q=90",
  "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=2400&q=90",
  "https://images.unsplash.com/photo-1558981359-219d6364c9c8?auto=format&fit=crop&w=2400&q=90",
  "https://images.unsplash.com/photo-1558980664-10e7170b5df9?auto=format&fit=crop&w=2400&q=90",
  "https://images.unsplash.com/photo-1508357941501-0924cf312bbd?auto=format&fit=crop&w=2400&q=90",
];

const categoryFallbackImages: Record<string, string> = {
  Scooters: "/images/style-categories/scooters.png",
  "125cc": "/images/style-categories/125cc.png",
  "Super Sports": "/images/style-categories/super-sports.png",
  Roadster: "/images/style-categories/roadster.png",
  Adventure: "/images/style-categories/adventure.png",
  Custom: "/images/style-categories/custom.png",
};

export default async function Home() {
  const [bikes, page] = await Promise.all([getPublicStockBikes(), getWebsitePageByPath("/")]);
  const featured = bikes.slice(0, 4);
  const recent = bikes.slice(4, 8).length ? bikes.slice(4, 8) : featured;
  const categories = PUBLIC_STYLES.map(category => {
    const matches = bikes.filter(bike => matchesPublicStyle(bike, category));
    return { category, count: matches.length, image: categoryFallbackImages[category] };
  });
  const sections = homepageSections(page?.body_sections);
  const styleSection = section(sections, "style_categories");
  const prepSection = section(sections, "preparation");
  const featuredSection = section(sections, "featured_stock");
  const servicesSection = section(sections, "services");
  const whySection = section(sections, "why_yesmoto");
  const recentSection = section(sections, "recent_stock");
  const heroTitle = splitHeroTitle(page?.hero_title || `${dealership.heroHeadlineLine1}\n${dealership.heroHeadlineLine2}`);

  return <>
    <section className="hero"><div className="hero-slides" aria-hidden="true">{heroSlides.map((image, index) => <span style={{ backgroundImage: `url("${image}")`, animationDelay: `${index * 6}s` }} key={image} />)}</div><div className="wide hero-copy"><p>{page?.hero_kicker || dealership.heroTagline}</p><h1>{heroTitle[0]}<br /><em>{heroTitle[1]}</em></h1><h2>{page?.hero_subtitle || "Carefully selected used motorcycles, professionally prepared and delivered nationwide."}</h2><div className="rating">Excellent <b>*****</b> <span>Trusted by riders throughout the UK</span></div><SearchPanel bikes={bikes} /></div></section>
    <section className="trust-strip"><div className="wide trust-bar">{trustItems.map(item => <article key={item.title}><span>{item.icon}</span><div><b>{item.title}</b><small>{item.text}</small></div></article>)}</div></section>
    {styleSection && <section className="home-section wide"><div className="home-heading"><div><p>{styleSection.kicker}</p><h2>{styleSection.heading}<span>.</span></h2><small>{styleSection.subtitle}</small></div><Link href={styleSection.cta_href || "/stock"}>{styleSection.cta_label || "VIEW ALL MOTORCYCLES"} <Arrow /></Link></div><div className="categories">{categories.map(item => <CategoryTile {...item} key={item.category} />)}</div></section>}
    {prepSection && <section className="home-checks"><div className="wide"><div className="home-checks-heading"><p>{prepSection.kicker}</p><h2>{headingParts(prepSection.heading)[0]} <span>{headingParts(prepSection.heading)[1]}</span></h2><small>{prepSection.subtitle}</small></div><div className="home-check-grid">{enabledItems(prepSection).map(item => <article className="home-check-card" key={item.heading}><span className="home-check-image" style={{ backgroundImage: `url("${item.image_url}")`, backgroundPosition: item.image_position || "center" }} /><div><i aria-hidden="true">✓</i><h3>{item.heading}</h3><p>{item.body}</p></div></article>)}</div></div></section>}
    {featuredSection && <section className="featured-wrap"><div className="featured wide"><div className="section-title"><h2>{featuredSection.heading} <span>{featuredSection.subtitle}</span></h2><Link href={featuredSection.cta_href || "/stock"}>{featuredSection.cta_label || "VIEW ALL BIKES"} <Arrow /></Link></div>{featured.length ? <div className="bike-grid">{featured.map(bike => <BikeCard bike={bike} key={bike.id} />)}</div> : <div className="stock-state"><b>New stock arriving soon</b><span>Contact us and tell us what you are looking for.</span></div>}</div></section>}
    {servicesSection && <section className="home-services wide">{enabledItems(servicesSection).map((item, index) => <article className={index === 0 ? "sell" : ""} key={item.heading}><p>{item.kicker}</p><h2>{item.heading}</h2><span>{item.body}</span><Link href={item.cta_href || "/"}>{item.cta_label || "Learn more"} <Arrow /></Link></article>)}</section>}
    {whySection && <section className="home-why"><div className="wide"><div><p>{whySection.kicker}</p><h2>{whySection.heading}</h2><span>{whySection.body}</span><Link href={whySection.cta_href || "/why-buy-from-yesmoto"}>{whySection.cta_label || "Why buy from YesMoto"} <Arrow /></Link></div><div className="home-why-points">{enabledItems(whySection).map(item => <article key={item.heading}><strong>{item.heading}</strong><span>{item.body}</span></article>)}</div></div></section>}
    {recentSection && <section className="featured-wrap recent-stock"><div className="featured wide"><div className="section-title"><h2>{recentSection.heading} <span>{recentSection.subtitle}</span></h2><Link href={recentSection.cta_href || "/stock"}>{recentSection.cta_label || "BROWSE ALL STOCK"} <Arrow /></Link></div><div className="bike-grid">{recent.map(bike => <BikeCard bike={bike} key={bike.id} />)}</div></div></section>}
  </>;
}

function SearchPanel({ bikes }: { bikes: PublicStockBike[] }) {
  const makes = [...new Set(bikes.map(bike => bike.make))].sort();
  const models = [...new Set(bikes.map(bike => bike.model))].sort();
  return <div className="search-panel"><form action="/stock"><label>MAKE<select name="make" defaultValue=""><option value="">Any make</option>{makes.map(make => <option value={make} key={make}>{make}</option>)}</select></label><label>MODEL<select name="model" defaultValue=""><option value="">Any model</option>{models.map(model => <option value={model} key={model}>{model}</option>)}</select></label><label>MIN PRICE<select name="min" defaultValue=""><option value="">No minimum</option><option value="3000">£3,000</option><option value="5000">£5,000</option><option value="7500">£7,500</option></select></label><label>MAX PRICE<select name="max" defaultValue=""><option value="">No maximum</option><option value="5000">£5,000</option><option value="10000">£10,000</option><option value="15000">£15,000</option></select></label><label>STYLE<select name="category" defaultValue=""><option value="">Any style</option>{PUBLIC_STYLES.map(style => <option value={style} key={style}>{style}</option>)}</select></label><button>SEARCH BIKES <Arrow /></button></form><div><p>{dealership.financeBanner}</p><Link href="/finance">APPLY FOR FINANCE</Link></div></div>;
}

function homepageSections(value: WebsitePageSection[] | undefined) {
  const source = value?.length ? value : defaultHomepageSections();
  return source.filter(item => item.enabled !== false).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

function section(items: WebsitePageSection[], key: string) {
  return items.find(item => item.key === key);
}

function enabledItems(item: WebsitePageSection) {
  return (item.items ?? []).filter(child => child.enabled !== false).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

function splitHeroTitle(value: string) {
  const parts = value.split(/\n|\|/).map(item => item.trim()).filter(Boolean);
  return [parts[0] || dealership.heroHeadlineLine1, parts.slice(1).join(" ") || dealership.heroHeadlineLine2];
}

function headingParts(value: string) {
  const index = value.indexOf(".");
  return index === -1 ? [value, ""] : [value.slice(0, index + 1).trim(), value.slice(index + 1).trim()];
}
