import { getRetailCheck } from "@/lib/retail-checks";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const data=await getRetailCheck(id);if(!data)return Response.json({error:"Retail Check not found"},{status:404});return Response.json({...data,createdTime:data.created_at})}catch(error){return Response.json({error:error instanceof Error?error.message:"Unable to load Retail Check"},{status:500})}}
