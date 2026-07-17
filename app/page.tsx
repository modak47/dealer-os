import Link from "next/link";
import { dealership } from "@/config/dealership";
import { getPublicStockBikes, type PublicStockBike } from "@/lib/stock";
import { matchesPublicStyle, PUBLIC_STYLES } from "@/lib/public-stock-filters";
import { BikeCard } from "./components/bike-card";
import { Arrow } from "./components/icons";
import { CategoryTile } from "./components/category-tile";

export const revalidate=60;
const trustItems=["Excellent reviews","Finance available","Nationwide delivery","Part exchange welcome","Reserve online"];
const categoryFallbackImages:Record<string,string>={
  Scooters:"https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=82",
  "125cc":"https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=900&q=82",
  "Super Sports":"https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=900&q=82",
  Roadster:"https://images.unsplash.com/photo-1558980664-10e7170b5df9?auto=format&fit=crop&w=900&q=82",
  Adventure:"https://images.unsplash.com/photo-1508357941501-0924cf312bbd?auto=format&fit=crop&w=900&q=82",
  Custom:"https://images.unsplash.com/photo-1558981359-219d6364c9c8?auto=format&fit=crop&w=900&q=82",
};

export default async function Home(){
  const bikes=await getPublicStockBikes();const featured=bikes.slice(0,4);const recent=bikes.slice(4,8).length?bikes.slice(4,8):featured;
  const categories=PUBLIC_STYLES.map(category=>{const matches=bikes.filter(bike=>matchesPublicStyle(bike,category));return {category,count:matches.length,image:matches.find(bike=>bike.image!=="/bike-placeholder.svg")?.image??categoryFallbackImages[category]}});
  return <>
    <section className="hero"><div className="wide hero-copy"><p>{dealership.heroTagline}</p><h1>{dealership.heroHeadlineLine1}<br/><em>{dealership.heroHeadlineLine2}</em></h1><h2>Carefully selected used motorcycles, professionally prepared and delivered nationwide.</h2><div className="rating">Excellent <b>★★★★★</b> <span>Trusted by riders throughout the UK</span></div><SearchPanel bikes={bikes}/></div></section>
    <section className="trust-strip"><div className="wide">{trustItems.map((item,index)=><div key={item}><span>{index===0?"★":"✓"}</span>{item}</div>)}</div></section>
    <section className="home-section wide"><div className="home-heading"><div><p>FIND YOUR PERFECT RIDE</p><h2>SHOP BY STYLE</h2></div><Link href="/stock">VIEW ALL MOTORCYCLES <Arrow/></Link></div><div className="categories">{categories.map(item=><CategoryTile {...item} key={item.category}/>)}</div></section>
    <section className="featured-wrap"><div className="featured wide"><div className="section-title"><h2>FEATURED BIKES <span>Hand-picked quality used motorcycles</span></h2><Link href="/stock">VIEW ALL BIKES <Arrow/></Link></div>{featured.length?<div className="bike-grid">{featured.map(bike=><BikeCard bike={bike} key={bike.id}/>)}</div>:<div className="stock-state"><b>New stock arriving soon</b><span>Contact us and tell us what you are looking for.</span></div>}</div></section>
    <section className="home-services wide"><article className="sell"><p>SELL YOUR MOTORCYCLE</p><h2>FAIR VALUE.<br/>FAST PAYMENT.</h2><span>Nationwide collection, secure payment and no tyre kickers.</span><Link href="/sell-my-bike">Get a valuation <Arrow/></Link></article><article><p>FINANCE YOUR NEXT BIKE</p><h2>FLEXIBLE FINANCE</h2><span>Explore motorcycle finance options from our trusted partners.</span><Link href="/finance">Explore finance <Arrow/></Link></article><article><p>DELIVERED TO YOUR DOOR</p><h2>NATIONWIDE DELIVERY</h2><span>Specialist insured motorcycle transport throughout mainland UK.</span><Link href="/nationwide-delivery">Delivery information <Arrow/></Link></article></section>
    <section className="home-why"><div className="wide"><div><p>WHY YESMOTO</p><h2>USED MOTORCYCLES,<br/>DONE PROPERLY.</h2><span>More than 22 years of motorcycle experience goes into how we select, inspect, describe and prepare every bike.</span><Link href="/why-buy-from-yesmoto">Why buy from YesMoto <Arrow/></Link></div><div className="home-why-points"><article><strong>50–100</strong><span>Detailed photographs on most motorcycles</span></article><article><strong>90%</strong><span>Customers buying remotely across the UK</span></article><article><strong>6 months</strong><span>Minimum MOT on every retail motorcycle</span></article><article><strong>3 months</strong><span>Warranty First cover on qualifying bikes</span></article></div></div></section>
    <section className="featured-wrap recent-stock"><div className="featured wide"><div className="section-title"><h2>RECENT STOCK <span>The latest motorcycles available from YesMoto</span></h2><Link href="/stock">BROWSE ALL STOCK <Arrow/></Link></div><div className="bike-grid">{recent.map(bike=><BikeCard bike={bike} key={bike.id}/>)}</div></div></section>
  </>;
}

function SearchPanel({bikes}:{bikes:PublicStockBike[]}){const makes=[...new Set(bikes.map(bike=>bike.make))].sort();const models=[...new Set(bikes.map(bike=>bike.model))].sort();return <div className="search-panel"><form action="/stock"><label>MAKE<select name="make" defaultValue=""><option value="">Any make</option>{makes.map(make=><option value={make} key={make}>{make}</option>)}</select></label><label>MODEL<select name="model" defaultValue=""><option value="">Any model</option>{models.map(model=><option value={model} key={model}>{model}</option>)}</select></label><label>MIN PRICE<select name="min" defaultValue=""><option value="">No minimum</option><option value="3000">£3,000</option><option value="5000">£5,000</option><option value="7500">£7,500</option></select></label><label>MAX PRICE<select name="max" defaultValue=""><option value="">No maximum</option><option value="5000">£5,000</option><option value="10000">£10,000</option><option value="15000">£15,000</option></select></label><label>STYLE<select name="category" defaultValue=""><option value="">Any style</option>{PUBLIC_STYLES.map(style=><option value={style} key={style}>{style}</option>)}</select></label><button>SEARCH BIKES <Arrow/></button></form><div><p>{dealership.financeBanner}</p><Link href="/finance">APPLY FOR FINANCE</Link></div></div>}
