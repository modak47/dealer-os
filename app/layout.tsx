import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import { dealership } from "@/config/dealership";
import "./globals.css";
import { Header } from "./components/header";
import { Footer } from "./components/footer";

const display=Barlow_Condensed({subsets:["latin"],variable:"--display",weight:["600","700","800"]});
const body=Inter({subsets:["latin"],variable:"--body"});
export const metadata:Metadata={title:{default:`${dealership.dealerName} | Premium Used Motorcycles`,template:`%s | ${dealership.dealerName}`},description:dealership.heroSubtitle,icons:{icon:[{url:"/favicon-yesmoto.png",type:"image/png"}],shortcut:"/favicon-yesmoto.png",apple:"/favicon-yesmoto.png"}};

export default function Layout({children}:{children:React.ReactNode}){const brandStyles={"--green":dealership.primaryColour,"--red":dealership.redAccent} as CSSProperties;return <html lang="en" className={`${display.variable} ${body.variable}`}><body style={brandStyles}><Header/><main>{children}</main><Footer/></body></html>}
