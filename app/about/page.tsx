import type { Metadata } from "next";
import Link from "next/link";
import { dealership } from "@/config/dealership";

export const metadata:Metadata={title:"About YesMoto",description:"Meet YesMoto, Brighton's independent used motorcycle specialist with more than 22 years of motorcycle experience."};

const stats=[
  {value:"22+",label:"Years’ experience",detail:"Across workshops, sales and buying"},
  {value:"90%",label:"Remote sales",detail:"Motorcycles supplied across the UK"},
  {value:"50–100",label:"Photos per bike",detail:"Detailed, confidence-inspiring adverts"},
  {value:"6 months",label:"Minimum MOT",detail:"On every retail motorcycle"},
];
const journey=["Apprentice technician","Workshop roles","Motorcycle sales","Stock buyer","Dealership management"];
const sources=["Private owners across the UK","Franchised main dealer part exchanges","Sell Your Motorbike Ltd, our nationwide buying company"];
const advertDetails=["50–100 high-quality photographs","Full walkaround video","Comprehensive description","Service history information where available","Keys, accessories and documentation clearly detailed"];
const preparation=["Servicing where required","Comprehensive safety inspection","Brake maintenance","Replacement tyres where required","Professional valeting","Pre-Delivery Inspection and history checks"];

export default function About(){return <>
  <section className="about-hero"><div className="wide"><p className="kicker">ABOUT YESMOTO</p><h1>MOTORCYCLES AREN’T<br/>JUST OUR BUSINESS.<br/><em>THEY’RE OUR EXPERIENCE.</em></h1><p>Carefully selected used motorcycles, professionally prepared in Brighton and supplied to riders throughout the UK.</p><div><Link href="/used-bikes">Browse our motorcycles</Link><Link href="/sell-my-bike" className="outline">Sell your motorcycle</Link></div></div></section>

  <section className="about-stats wide">{stats.map(item=><article key={item.label}><strong>{item.value}</strong><h2>{item.label}</h2><p>{item.detail}</p></article>)}</section>

  <section className="about-intro wide"><div><p className="about-kicker">WELCOME TO YESMOTO</p><h2>BUYING A USED MOTORCYCLE SHOULD FEEL STRAIGHTFORWARD.</h2></div><div><p>At YesMoto, we specialise in supplying carefully selected used motorcycles and scooters from our premises in Brighton, East Sussex.</p><p>With around 90% of our sales completed remotely, detailed photography, walkaround videos and honest descriptions help customers buy with confidence wherever they are in the country.</p><blockquote>Our aim is simple: to make buying a used motorcycle straightforward, transparent and enjoyable.</blockquote><p>Whether you’re searching for your first scooter, a weekend sports bike or your next adventure motorcycle, we’re here to help you find the right bike.</p></div></section>

  <section className="about-dark-section"><div className="wide about-experience"><div><p className="about-kicker">BUILT ON HANDS-ON KNOWLEDGE</p><h2>OVER 22 YEARS OF MOTORCYCLE EXPERIENCE</h2><p>Motorcycles have been at the centre of our working life for more than 22 years. That practical experience gives us a genuine understanding of every machine we buy and sell—and the confidence to select, inspect and prepare it properly.</p></div><div className="experience-timeline">{journey.map((step,index)=><div key={step}><span>{String(index+1).padStart(2,"0")}</span><b>{step}</b></div>)}</div></div></section>

  <section className="about-card-grid wide"><article><span className="about-icon">✓</span><p className="about-kicker">CAREFULLY SELECTED</p><h2>THE RIGHT BIKES, FROM TRUSTED SOURCES</h2><p>Unlike many dealerships, we don’t routinely purchase motorcycles from auction. Our stock comes from places we trust:</p><ul>{sources.map(item=><li key={item}>{item}</li>)}</ul><p>Every motorcycle is individually inspected before we decide whether it meets our standards. If we wouldn’t be happy owning it ourselves, it doesn’t make it onto our forecourt.</p></article><article><span className="about-icon">▶</span><p className="about-kicker">BUY ONLINE WITH CONFIDENCE</p><h2>THE DETAIL YOU NEED TO DECIDE</h2><p>Buying online can feel like a big decision, so every advert is designed to be detailed, accurate and honest.</p><ul>{advertDetails.map(item=><li key={item}>{item}</li>)}</ul><p>Need another photograph, video or detail? We’re always happy to help before you make your decision.</p></article></section>

  <section className="about-prep"><div className="wide"><div className="about-prep-copy"><p className="about-kicker">PROFESSIONALLY PREPARED</p><h2>QUALITY RATHER THAN QUANTITY</h2><p>Our workshop is dedicated exclusively to preparing YesMoto motorcycles. Every bike is assessed individually, with work tailored to its condition—not a one-size-fits-all checklist.</p><div className="prep-guarantee"><b>Every retail motorcycle receives</b><span>Comprehensive PDI</span><span>Vehicle history check</span><span>Minimum 6 months MOT</span></div></div><div className="prep-list">{preparation.map((item,index)=><div key={item}><span>{index+1}</span><b>{item}</b></div>)}</div></div></section>

  <section className="meet-business wide"><div className="meet-photo" role="img" aria-label="YesMoto motorcycle preparation"/><div><p className="about-kicker">MEET THE BUSINESS</p><h2>A DIFFERENT KIND OF MOTORCYCLE DEALERSHIP</h2><p>We’re not a traditional high-street dealership with rows of bikes and pushy salespeople. Our Brighton warehouse operates by appointment, so every customer gets the time and attention they deserve.</p><p>There’s no pressure selling—just honest advice, the opportunity to inspect the motorcycle properly and the information you need to make the right decision.</p><div className="location-note"><strong>Brighton, East Sussex</strong><span>{dealership.address}</span><span>Visits by appointment</span></div></div></section>

  <section className="nationwide-banner"><div className="wide"><p className="about-kicker">FROM BRIGHTON TO YOUR DOOR</p><h2>NATIONWIDE DELIVERY</h2><p>Whether you collect in person or choose nationwide delivery, you’ll receive the same preparation, communication and customer service wherever you are in the UK.</p></div></section>

  <section className="about-promise wide"><div><p className="about-kicker">OUR PROMISE</p><h2>HONEST MOTORCYCLES.<br/>PROPERLY PREPARED.</h2><p>We’re passionate about motorcycles and believe in treating every customer the way we’d expect to be treated ourselves. No claims that every used bike is perfect. No high-pressure tactics. Just transparent descriptions, professional preparation and friendly, knowledgeable service.</p></div><div className="promise-points"><span>Honest advice</span><span>Professional preparation</span><span>Transparent descriptions</span><span>Friendly, knowledgeable service</span></div></section>

  <section className="about-cta"><div className="wide"><p>#WEAREYESMOTO</p><h2>READY TO FIND YOUR NEXT MOTORCYCLE?</h2><div><Link href="/used-bikes">Browse our motorcycles</Link><Link href="/sell-my-bike" className="outline">Sell your motorcycle</Link></div></div></section>
  </>}
