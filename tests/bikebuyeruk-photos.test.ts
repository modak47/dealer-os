import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { handleBikeBuyerPhotos, verifyPhoto } from '../lib/bikebuyeruk-photos';
import { createClient } from '@supabase/supabase-js';

test('photo handler rejects absent/wrong credentials and disabled state before database access',async()=>{
  const options={key:'a'.repeat(40),enabled:true,database:()=>{throw new Error('Must not access database');}};
  assert.equal((await handleBikeBuyerPhotos(new Request('https://example.invalid'),options)).status,401);
  assert.equal((await handleBikeBuyerPhotos(new Request('https://example.invalid',{headers:{Authorization:'Bearer '+'b'.repeat(40)}}),options)).status,401);
  assert.equal((await handleBikeBuyerPhotos(new Request('https://example.invalid',{headers:{Authorization:'Bearer '+options.key}}),{...options,enabled:false})).status,503);
});

test('real Storage client uploads only reserved bytes, verifies lost-response retries and refuses foreign identities',async()=>{
 const bytes=await sharp({create:{width:100,height:100,channels:3,background:'blue'}}).jpeg().toBuffer();
 const photo={id:randomUUID(),sha256:createHash('sha256').update(bytes).digest('hex'),byte_size:bytes.length,width:100,height:100};
 const key='a'.repeat(40);let stored:Buffer|undefined;let acknowledgements=0;let downloads=0;
 const db=createClient('https://isolated.example.invalid','test-server-key',{global:{fetch:async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.pathname.endsWith('/bikebuyeruk_photo_transfers'))return Response.json(url.searchParams.get('external_submission_id')==='eq.synthetic' ? {manifest:[photo],completed_at:null,removed_at:null} : null);
  if(url.pathname.endsWith('/rpc/bbuk_photo_transfer')){acknowledgements++;return Response.json({complete:false});}
  if(url.pathname.includes('/storage/v1/object/')){
   assert.match(url.pathname,new RegExp(`motorgeeks-seller-photos/bike-buyer-uk/91001/${photo.id}-${photo.sha256}\\.jpg$`));
   if(init?.method==='POST'){
    assert.equal(new Headers(init.headers).get('x-upsert'),'false');
    if(stored)return Response.json({statusCode:'409',error:'Duplicate',message:'already exists'},{status:409});
    stored=Buffer.from(await new Response(init.body).arrayBuffer());return Response.json({Key:'stored'});
   }
   downloads++;return new Response(new Uint8Array(stored!));
  }
  throw Error('Unexpected request '+url.pathname);
 }}});
 const request=(external='synthetic',body=bytes)=>new Request('https://isolated.example.invalid/photos',{method:'PUT',headers:{Authorization:`Bearer ${key}`,'content-type':'image/jpeg','x-lead-id':'91001','x-submission-id':external,'x-photo-id':photo.id},body:new Uint8Array(body)});
 const options={key,enabled:true,database:()=>db};
 assert.equal((await handleBikeBuyerPhotos(request(),options)).status,200);
 assert.deepEqual(stored,bytes);assert.equal(acknowledgements,1);
 assert.equal((await handleBikeBuyerPhotos(request(),options)).status,200);assert.equal(downloads,1);assert.equal(acknowledgements,2);
 assert.equal((await handleBikeBuyerPhotos(request('foreign'),options)).status,409);
 assert.equal((await handleBikeBuyerPhotos(request('synthetic',Buffer.from('changed')),options)).status,409);
 assert.equal(acknowledgements,2);
});
test('photo bytes must match the reserved digest, dimensions and decoded metadata-free JPEG',async()=>{
  const bytes=await sharp({create:{width:100,height:100,channels:3,background:'red'}}).jpeg().toBuffer();
  const photo={id:randomUUID(),sha256:createHash('sha256').update(bytes).digest('hex'),byte_size:bytes.length,width:100,height:100};
  await verifyPhoto(bytes,photo);
  await assert.rejects(verifyPhoto(bytes,{...photo,sha256:'0'.repeat(64)}),/photo_conflict/);
  await assert.rejects(verifyPhoto(bytes,{...photo,width:101}),/invalid_photo/);
  const invalid=Buffer.from('not a jpeg');
  await assert.rejects(verifyPhoto(invalid,{...photo,byte_size:invalid.length,sha256:createHash('sha256').update(invalid).digest('hex')}),/invalid_photo/);
  const metadata=await sharp(bytes).withMetadata().jpeg().toBuffer();
  await assert.rejects(verifyPhoto(metadata,{...photo,byte_size:metadata.length,sha256:createHash('sha256').update(metadata).digest('hex')}),/invalid_photo/);
});
