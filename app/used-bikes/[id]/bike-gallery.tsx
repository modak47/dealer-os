"use client";
import { useEffect, useRef, useState } from "react";

export function BikeGallery({images,alt}:{images:string[];alt:string}){
  const safe=images.length?images:["/bike-placeholder.svg"]; const [index,setIndex]=useState(0); const [open,setOpen]=useState(false);
  const touchStart=useRef<number|null>(null); const multiple=safe.length>1;
  const previous=()=>setIndex(current=>(current-1+safe.length)%safe.length); const next=()=>setIndex(current=>(current+1)%safe.length);
  useEffect(()=>{if(!open)return;const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);if(event.key==="ArrowLeft")previous();if(event.key==="ArrowRight")next()};document.addEventListener("keydown",onKey);document.body.style.overflow="hidden";return()=>{document.removeEventListener("keydown",onKey);document.body.style.overflow=""}},[open,safe.length]);
  const endSwipe=(x:number)=>{if(touchStart.current===null)return;const distance=x-touchStart.current;if(Math.abs(distance)>45)(distance<0?next:previous)();touchStart.current=null};
  const swipe={onTouchStart:(event:React.TouchEvent)=>{touchStart.current=event.changedTouches[0].clientX},onTouchEnd:(event:React.TouchEvent)=>endSwipe(event.changedTouches[0].clientX)};
  return <div className="bike-gallery"><div className="gallery-main" {...swipe}>
    <button className="gallery-image-button" onClick={()=>setOpen(true)} aria-label="Open fullscreen photo gallery"><img src={safe[index]} alt={`${alt} photo ${index+1}`}/></button>
    {multiple&&<><button className="gallery-arrow previous" onClick={previous} aria-label="Previous photo">‹</button><button className="gallery-arrow next" onClick={next} aria-label="Next photo">›</button></>}
    <span className="gallery-counter">{index+1} / {safe.length}</span><button className="view-all-photos" onClick={()=>setOpen(true)}>View all photos</button>
  </div>{multiple&&<div className="gallery-thumbs" aria-label="Photo thumbnails">{safe.map((image,i)=><button className={i===index?"active":""} onClick={()=>setIndex(i)} aria-label={`Show photo ${i+1}`} aria-current={i===index} key={`${image}-${i}`}><img src={image} alt=""/></button>)}</div>}
  {open&&<div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={`${alt} photo gallery`} {...swipe}><button className="lightbox-close" onClick={()=>setOpen(false)} aria-label="Close photo gallery">×</button><span className="lightbox-counter">{index+1} / {safe.length}</span>{multiple&&<button className="lightbox-arrow previous" onClick={previous} aria-label="Previous photo">‹</button>}<img src={safe[index]} alt={`${alt} photo ${index+1}`}/>{multiple&&<button className="lightbox-arrow next" onClick={next} aria-label="Next photo">›</button>}</div>}
  </div>;
}
