import { sellerInput } from "../../../lib/seller-input";
import { ensureDraft, saveDraft } from "../../../lib/marketplace";
import { limitSeller,readSellerJson,sameOrigin,sellerFailure } from "../../../lib/seller-security";
export const dynamic="force-dynamic";
export async function GET(){try{const d=(await ensureDraft()).draft; const clean=sellerInput({vehicle:d.vehicle_snapshot,condition:d.condition_snapshot,seller:d.seller_snapshot}); return Response.json({draft:{id:d.id,revision:d.revision,current_step:d.current_step,registration:d.registration,website_lead_id:d.website_lead_id,vehicle_snapshot:clean.vehicle,condition_snapshot:clean.condition,seller_snapshot:clean.seller}});}catch(e){return sellerFailure(e);}}
export async function PATCH(request:Request){try{sameOrigin(request);await limitSeller('draft-save',180,60);return Response.json({draft:await saveDraft(await readSellerJson(request))});}catch(e){return sellerFailure(e);}}
