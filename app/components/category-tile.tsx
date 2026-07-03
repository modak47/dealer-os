"use client";
import Link from "next/link";
import { useState } from "react";
import { Arrow } from "./icons";

export function CategoryTile({category,image}:{category:string;image?:string}){const [failed,setFailed]=useState(!image||image==="/bike-placeholder.svg");return <Link href={`/used-bikes?category=${encodeURIComponent(category)}`}>{failed?<div className="category-placeholder" aria-hidden="true"><span>{category.slice(0,1)}</span></div>:<img src={image} alt="" onError={()=>setFailed(true)}/>}<div><b>{category}</b><span>View all bikes</span></div><Arrow/></Link>}
