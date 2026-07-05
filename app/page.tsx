import Link from "next/link";
import { dealership } from "@/config/dealership";
import { getFeaturedBikes } from "@/lib/stock";
import { BikeCard } from "./components/bike-card";
import { Arrow } from "./components/icons";
import { CategoryTile } from "./components/category-tile";

export const revalidate=60;

const cats=["Scooters","125cc","Super Sports","Roadster","Adventure","Custom"];
const trustItems=["Excellent Reviews","Finance Available","Nationwide Delivery","Part Exchange Welcome","Reserve Online"];

export default async function Home(){const bikes=await getFeaturedBikes();return <>
  <section className="hero"><div className="wide hero-copy"><p>{dealership.heroTagline}</p><h1>{dealership.heroHeadlineLine1}<br/><em>{dealership.heroHeadlineLine2}</em></h1><h2>{dealership.heroSubtitle}</h2><div className="rating">Excellent <b>★ ★ ★ ★ ★</b> <span>972 reviews on</span> ★ Trustpilot</div><SearchPanel/></div></section>
  <section className="trust-strip"><div className="wide">{trustItems.map((item,index)=><div key={item}><span>{index===0?"★":"✓"}</span>{item}</div>)}</div></section>
  <section className="home-section wide"><div className="home-heading"><div><p>FIND YOUR PERFECT RIDE</p><h2>SHOP BY STYLE</h2></div><Link href="/used-bikes">VIEW ALL CATEGORIES <Arrow/></Link></div><div className="categories">{cats.map((category,index)=><CategoryTile category={category} image={bikes[index%bikes.length]?.image} key={category}/>)}</div></section>
  <section className="featured-wrap"><div className="featured wide"><div className="section-title"><h2>FEATURED BIKES <span>Hand picked quality used bikes</span></h2><Link href="/used-bikes">VIEW ALL BIKES <Arrow/></Link></div><div className="bike-grid">{bikes.slice(0,4).map(b=><BikeCard bike={b} key={b.id}/>)}</div></div></section>
</>}

function SearchPanel(){return <div className="search-panel"><form action="/used-bikes">
  <label>ANY MAKE<select name="make"><option>Any Make</option><option>BMW</option><option>Ducati</option><option>Honda</option><option>Triumph</option><option>Yamaha</option></select></label>
  <label>ANY MODEL<select name="model"><option>Any Model</option><option>Adventure</option><option>Sports</option><option>Naked</option></select></label>
  <label>MIN PRICE<select name="min"><option>No Min</option><option>£5,000</option><option>£7,500</option></select></label>
  <label>MAX PRICE<select name="max"><option>No Max</option><option>£10,000</option><option>£15,000</option></select></label>
  <label>YEAR<select name="year"><option>Any Year</option><option>2024 onward</option><option>2022 onward</option><option>2020 onward</option></select></label>
  <label>BODY STYLE<select name="style"><option>Any Style</option>{cats.map(cat=><option key={cat}>{cat}</option>)}</select></label>
  <button>SEARCH BIKES <Arrow/></button>
  </form><div><p>{dealership.financeBanner}</p><Link href="/finance">APPLY FOR FINANCE NOW</Link></div></div>}
