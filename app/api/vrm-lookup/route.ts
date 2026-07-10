import { NextResponse } from "next/server";
import { lookupVrm } from "@/lib/vrm-lookup";

export async function POST(request:Request){
  let input:unknown;
  try{input=await request.json()}catch{return NextResponse.json({error:"Request body must be valid JSON."},{status:400})}
  const suppliedVrm=input&&typeof input==="object"&&"vrm" in input?(input as {vrm?:unknown}).vrm:null;
  if(typeof suppliedVrm!=="string"||!suppliedVrm.trim())return NextResponse.json({error:"VRM is required."},{status:400});
  try{
    const data=await lookupVrm(suppliedVrm);
    return NextResponse.json(data);
  }catch(error){
    console.error("Motorway VRM lookup failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"The vehicle lookup service is currently unavailable. Please try again."},{status:502});
  }
}
