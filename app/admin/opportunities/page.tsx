import { getSupabaseAdmin } from "@/lib/supabase/admin";
import OpportunitiesTracker from "./OpportunitiesTracker";
import { normalizeOpportunities, opportunitySchemaError } from "./normalize-opportunity";
import { loadOpportunitiesWithListingDates } from "./opportunity-data";
import type { ScannerStatus } from "./types";

export const dynamic="force-dynamic";

export default async function OpportunitiesPage(){
  let rawOpportunities:unknown[]=[];let scannerStatus:ScannerStatus|null=null;let loadError:string|null=null;
  try{const supabase=getSupabaseAdmin();const [opportunitiesResult,automationJobResult,scannerStatusResult]=await Promise.all([loadOpportunitiesWithListingDates(supabase),supabase.from("automation_jobs").select("*").eq("job_name","opportunity_scanner").maybeSingle(),supabase.from("scanner_status").select("*").eq("id",1).maybeSingle()]);rawOpportunities=opportunitiesResult.data??[];loadError=opportunitiesResult.error?.message??opportunitySchemaError(rawOpportunities);const legacyStatus=(scannerStatusResult.data as ScannerStatus|null)??null;const automationJob=automationJobResult.data as (ScannerStatus&{last_finished?:string|null})|null;scannerStatus=automationJob?{...legacyStatus,...automationJob,last_run:automationJob.last_finished??automationJob.last_started??legacyStatus?.last_run??""}:legacyStatus;if(opportunitiesResult.error)console.error("Unable to load opportunities:",opportunitiesResult.error);if(automationJobResult.error)console.error("Unable to load automation job status:",automationJobResult.error);if(scannerStatusResult.error)console.error("Unable to load scanner status:",scannerStatusResult.error)}catch(error){loadError=error instanceof Error?error.message:"Unable to load opportunities."}
  return <OpportunitiesTracker initialOpportunities={normalizeOpportunities(rawOpportunities)} initialScannerStatus={scannerStatus} initialError={loadError}/>;
}
