'use client';
/* Private, short-lived signed URLs must be loaded directly, without a shared image-optimizer cache. */
/* eslint-disable @next/next/no-img-element */
import { useEffect,useState } from 'react';
import { sellerPhotoAccept,sellerPhotoLimit,sellerPhotoMaxBytes } from '../lib/seller-input';
type Photo={id:string;preview_url:string;original_filename:string};
type Upload={file:File;status:'waiting'|'uploading'|'done'|'failed';error?:string};
export function SellerPhotoControls({endpoint='/api/valuation/photos'}:{endpoint?:string}){
 const [photos,setPhotos]=useState<Photo[]>([]),[uploads,setUploads]=useState<Upload[]>([]),[editable,setEditable]=useState(false),[message,setMessage]=useState('Loading photos…'),[loaded,setLoaded]=useState(false);
 useEffect(()=>{let current=true;fetch(endpoint).then(async r=>{const p=await r.json();if(!r.ok)throw new Error(p.error);if(current){setPhotos(p.photos);setEditable(p.editable);setLoaded(true);setMessage('');}}).catch(()=>{if(current)setMessage('Photos could not be loaded. Refresh to retry.');});return()=>{current=false;};},[endpoint]);
 useEffect(()=>{if(loaded&&endpoint==='/api/seller/photos')window.dispatchEvent(new CustomEvent('mg-seller-photo-count',{detail:photos.length}));},[photos.length,loaded,endpoint]);
 async function upload(items:Upload[]){
  for(const item of items){item.status='uploading';setUploads(v=>[...v]);
   try{if(item.file.size>sellerPhotoMaxBytes)throw new Error('Maximum 4 MiB per photo.');const form=new FormData();form.append('photos',item.file);const r=await fetch(endpoint,{method:'POST',body:form});const p=await r.json();if(!r.ok)throw new Error(p.error||'Upload failed.');setPhotos(p.photos);setEditable(p.editable);item.status='done';item.error=undefined;}
   catch(e){item.status='failed';item.error=e instanceof Error?e.message:'Upload failed.';}
   setUploads(v=>[...v]);
  }
 }
 const busy=uploads.some(x=>x.status==='uploading'||x.status==='waiting');
 return <div><p role="status">{message}</p><p>{photos.length} of {sellerPhotoLimit} photos. JPEG, PNG or WebP, up to 4 MiB each. Please convert HEIC/HEIF to JPEG first.</p>
 {!editable&&<p>Photos can be changed while your profile is awaiting review. Once it is live, accepted or closed, contact MotorGeeks for corrections.</p>}
 {editable&&<label className="mg-uploader"><b>Choose photos</b><input type="file" multiple accept={sellerPhotoAccept} disabled={busy||photos.length>=sellerPhotoLimit} onChange={e=>{const added=Array.from(e.target.files||[]).map(file=>({file,status:'waiting' as const}));setUploads(v=>[...v,...added]);void upload(added);e.target.value='';}}/></label>}
 <ul aria-live="polite">{uploads.map((item,i)=><li key={i}>{item.file.name}: {item.status==='done'?'Uploaded':item.status}{item.error&&` — ${item.error}`} {item.status==='failed'&&<button type="button" disabled={busy} onClick={()=>void upload([item])}>Retry {item.file.name}</button>}</li>)}</ul>
 <div className="mg-photo-preview-grid">{photos.map(photo=><figure key={photo.id}><img src={photo.preview_url} alt={photo.original_filename||'Motorcycle photo'}/><figcaption>{photo.original_filename}</figcaption>{editable&&<button type="button" className="mg-photo-remove" aria-label={`Remove ${photo.original_filename}`} disabled={busy} onClick={async()=>{try{const r=await fetch(`${endpoint}?id=${encodeURIComponent(photo.id)}`,{method:'DELETE'});const p=await r.json();if(!r.ok)throw new Error(p.error);setPhotos(p.photos);}catch(e){setMessage(e instanceof Error?e.message:'Could not remove photo.');}}}>×</button>}</figure>)}</div></div>;
}

export function SellerPhotoSummary({initialCount,rail=false}:{initialCount:number;rail?:boolean}){
 const [count,setCount]=useState(initialCount);
 useEffect(()=>{const update=(event:Event)=>setCount((event as CustomEvent<number>).detail);window.addEventListener('mg-seller-photo-count',update);return()=>window.removeEventListener('mg-seller-photo-count',update);},[]);
 return rail?<article className={count?'done':''}><b>Photos</b><span>{count?`${count} added`:'Can add later'}</span></article>:<p>{count?`${count} ${count===1?"photo is":"photos are"} attached to your motorcycle profile.`:'No photos have been added yet. We will still review your profile, but photos help dealers make better offers.'}</p>;
}
