import { getSupabaseAdmin } from "@/lib/supabase/admin";
import OpportunitiesTracker from "./OpportunitiesTracker";
import { normalizeOpportunities, opportunitySchemaError } from "./normalize-opportunity";
import type { ScannerStatus } from "./types";

export const dynamic="force-dynamic";

export default async function OpportunitiesPage(){
  let rawOpportunities:unknown[]=[];let scannerStatus:ScannerStatus|null=null;let loadError:string|null=null;
  try{const supabase=getSupabaseAdmin();const [opportunitiesResult,scannerStatusResult]=await Promise.all([supabase.from("buying_opportunities").select("*").order("Score",{ascending:false}),supabase.from("scanner_status").select("*").eq("id",1).maybeSingle()]);rawOpportunities=opportunitiesResult.data??[];loadError=opportunitiesResult.error?.message??opportunitySchemaError(rawOpportunities);scannerStatus=(scannerStatusResult.data as ScannerStatus|null)??null;if(opportunitiesResult.error)console.error("Unable to load opportunities:",opportunitiesResult.error);if(scannerStatusResult.error)console.error("Unable to load scanner status:",scannerStatusResult.error)}catch(error){loadError=error instanceof Error?error.message:"Unable to load opportunities."}
  return <OpportunitiesTracker initialOpportunities={normalizeOpportunities(rawOpportunities)} initialScannerStatus={scannerStatus} initialError={loadError}/>;
}
