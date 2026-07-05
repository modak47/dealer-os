import { NextResponse } from "next/server";

const HPI_TEST_URL="https://trade.hpi.co.uk/trade/hpisecure/enquiry.do";

export async function GET(){
  try{
    const body=new URLSearchParams({vrm:"CJ23ZKZ"});
    const response=await fetch(HPI_TEST_URL,{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:body.toString(),
      cache:"no-store",
    });
    const responseBody=await response.text();
    return NextResponse.json({
      status:response.status,
      finalUrl:response.url,
      headers:Object.fromEntries(response.headers.entries()),
      body:responseBody.slice(0,3000),
    });
  }catch(error){
    return NextResponse.json({
      error:error instanceof Error?error.message:String(error),
    },{status:500});
  }
}
