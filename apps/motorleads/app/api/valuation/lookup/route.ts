import { ensureDraft } from "../../../lib/marketplace";
import { tokenHash } from "../../../lib/secure-token";
import { sellerInput } from "../../../lib/seller-input";
import { limitSeller,readSellerJson,sameOrigin,sellerFailure,sellerRpc } from "../../../lib/seller-security";
import { lookupByRegistration,VehicleLookupError } from "../../../lib/vehicle-provider";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{
 sameOrigin(request);await limitSeller('lookup',15);const body=await readSellerJson(request);const {token}=await ensureDraft();
 const vehicle=await lookupByRegistration(String(body.registration||''));
 const draft=await sellerRpc('mg_draft_operation',{p_hash:tokenHash(token),p_action:'provider',p_data:{version:body.version,evidence:{registration:vehicle.registration,lookupRaw:vehicle.lookupRaw,checkRaw:vehicle.checkRaw,lookupCompletedAt:new Date().toISOString()}}});
 return Response.json({vehicle:sellerInput({vehicle}).vehicle,version:draft.revision,lookupStatus:'found',vehicleCheckStatus:'not_checked'});
 }catch(e){if(e instanceof VehicleLookupError)return Response.json({error:e.message,code:e.code},{status:e.status});return sellerFailure(e);}}
