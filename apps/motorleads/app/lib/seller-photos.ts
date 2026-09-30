import 'server-only';
import sharp from 'sharp';
import { createHash,randomUUID } from 'node:crypto';
import { photoIdentity } from './marketplace';
import { getSupabaseAdmin } from './supabase-server';
import { sellerPhotoMaxBytes } from './seller-input';
import { limitSeller,sameOrigin,SellerError,sellerFailure,sellerRpc } from './seller-security';
export async function sellerPhotos(sellerArea=false){
 const result=await sellerRpc('mg_photo_operation',{p_hash:await photoIdentity(sellerArea),p_action:'list'});
 const photos=await Promise.all((result.photos||[]).map(async(p:Record<string,string>)=>{
  const signed=await getSupabaseAdmin().storage.from(p.storage_bucket).createSignedUrl(p.storage_path,900);
  if(signed.error)throw new SellerError('Photos could not be loaded. Please try again.',503);
  return {id:p.id,original_filename:p.original_filename,preview_url:signed.data.signedUrl};
 }));return {photos,editable:result.editable};
}
export async function normalizeSellerPhoto(file:File){
 if(file.size<1||file.size>sellerPhotoMaxBytes)throw new SellerError('Each photo must be no larger than 4 MiB.',413);
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new SellerError('Choose JPEG, PNG or WebP. Convert HEIC/HEIF to JPEG before uploading.',415);
 const bytes=Buffer.from(await file.arrayBuffer());
 try{
  const image=sharp(bytes,{limitInputPixels:36_000_000,animated:false});const metadata=await image.metadata();
  if(!['jpeg','png','webp'].includes(metadata.format||''))throw new Error('Unsupported bytes');
  const output=await image.rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
  if(output.length>sellerPhotoMaxBytes)throw new Error('Encoded image too large');
  return {bytes:output,key:createHash('sha256').update(bytes).digest('hex')};
 }catch{throw new SellerError('That file is not a supported readable photo. Use JPEG, PNG or WebP.',415);}
}
async function boundedForm(request:Request){
 const max=sellerPhotoMaxBytes+65536;if(Number(request.headers.get('content-length'))>max)throw new SellerError('Upload too large.',413);
 const reader=request.body?.getReader();if(!reader)throw new SellerError('Choose a photo.');const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new SellerError('Upload too large.',413);}chunks.push(value);}
 return new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
}
export async function GET(request:Request){try{return Response.json(await sellerPhotos(new URL(request.url).pathname.startsWith("/api/seller/")));}catch(e){return sellerFailure(e);}}
export async function POST(request:Request){
 let photo:Record<string,string>|undefined;let hash:string|undefined;
 try{
  sameOrigin(request);hash=await photoIdentity(new URL(request.url).pathname.startsWith("/api/seller/"));await limitSeller('photo-upload',60,3600,hash);
  const form=await boundedForm(request);const files=form.getAll('photos');if(files.length!==1||!(files[0] instanceof File))throw new SellerError('Upload one photo at a time.');
  const file=files[0],normalized=await normalizeSellerPhoto(file);
  photo=await sellerRpc('mg_photo_operation',{p_hash:hash,p_action:'reserve',p_data:{id:randomUUID(),key:normalized.key,type:'image/jpeg',bytes:normalized.bytes.length,filename:file.name}});
  if(photo!.status!=='uploaded'){
   const {error}=await getSupabaseAdmin().storage.from(photo!.storage_bucket).upload(photo!.storage_path,normalized.bytes,{contentType:'image/jpeg',upsert:false});
   if(error&&!['409','Duplicate'].includes(String(error.statusCode))&&!/already exists/i.test(error.message))throw new SellerError('Photo upload failed. Retry this file.',503);
   await sellerRpc('mg_photo_operation',{p_hash:hash,p_action:'finish',p_data:{id:photo!.id,lease:photo!.upload_lease_until}});
  }
  return Response.json(await sellerPhotos(new URL(request.url).pathname.startsWith("/api/seller/")));
 }catch(e){if(photo&&hash&&photo.status!=='uploaded'){try{await sellerRpc('mg_photo_operation',{p_hash:hash,p_action:'fail',p_data:{id:photo.id,lease:photo.upload_lease_until}});}catch{/* Lease expiry permits recovery without claiming success. */}}return sellerFailure(e);}
}
export async function DELETE(request:Request){try{sameOrigin(request);const hash=await photoIdentity(new URL(request.url).pathname.startsWith("/api/seller/"));await limitSeller('photo-remove',60,3600,hash);await sellerRpc('mg_photo_operation',{p_hash:hash,p_action:'remove',p_data:{id:new URL(request.url).searchParams.get('id')}});return Response.json(await sellerPhotos(new URL(request.url).pathname.startsWith("/api/seller/")));}catch(e){return sellerFailure(e);}}
