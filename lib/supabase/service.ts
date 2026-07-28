import "server-only";
import {createClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {getSupabaseEnv} from "./env";
export function createServiceClient(){const{url}=getSupabaseEnv(),key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for verified Stripe webhook processing.");return createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
