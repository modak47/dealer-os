import { submitDraft } from "../../../lib/marketplace";
import { limitSeller,readSellerJson,sameOrigin,sellerFailure } from "../../../lib/seller-security";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{sameOrigin(request);await limitSeller('submission',20);const result=await submitDraft(await readSellerJson(request));return Response.json(result,{status:result.ok?200:400});}catch(e){return sellerFailure(e);}}
