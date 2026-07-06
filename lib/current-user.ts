import "server-only";
import {createClient} from "@/lib/supabase/server";
export async function getCurrentUserId(){const client=await createClient();const {data:{user}}=client?await client.auth.getUser():{data:{user:null}};return user?.id??null}
