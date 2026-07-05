"use client";
import Link from "next/link";
import { useState } from "react";
import { Arrow } from "./icons";

export function CategoryTile({category,image,count=0}:{category:string;image?:string;count?:number}){const [failed,setFailed]=useState(!image||image==="/bike-placeholder.svg");return <Link href={`/stock?category=${encodeURIComponent(category)}`}>{failed?<div className="category-placeholder" aria-hidden="true"><span>{category.slice(0,1)}</span></div>:<img src={image} alt="" onError={()=>setFailed(true)}/>}<div><b>{category}</b><span>{count} bike{count===1?"":"s"}</span></div><Arrow/></Link>}
