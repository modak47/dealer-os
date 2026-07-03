import { NextResponse } from "next/server";

const MOTORWAY_VRM_URL="https://api.motorway.co.uk/platform/vrm-check";

export async function POST(request:Request){
  let input:unknown;
  try{input=await request.json()}catch{return NextResponse.json({error:"Request body must be valid JSON."},{status:400})}
  const suppliedVrm=input&&typeof input==="object"&&"vrm" in input?(input as {vrm?:unknown}).vrm:null;
  if(typeof suppliedVrm!=="string"||!suppliedVrm.trim())return NextResponse.json({error:"VRM is required."},{status:400});
  const vrm=suppliedVrm.trim().replace(/\s+/g,"").toUpperCase();
  try{
    const response=await fetch(MOTORWAY_VRM_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user:{},vrm}),cache:"no-store"});
    const contentType=response.headers.get("content-type")??"";
    const data:unknown=contentType.includes("application/json")?await response.json():{error:await response.text()||"Motorway returned an empty response."};
    if(!response.ok){
      const message=data&&typeof data==="object"&&"error" in data?String((data as {error:unknown}).error):`Vehicle lookup failed (${response.status}).`;
      return NextResponse.json({error:message,status:response.status,details:data},{status:response.status>=400&&response.status<600?response.status:502});
    }
    return NextResponse.json(data);
  }catch(error){
    console.error("Motorway VRM lookup failed",error);
    return NextResponse.json({error:"The vehicle lookup service is currently unavailable. Please try again."},{status:502});
  }
}
