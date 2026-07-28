import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request:Request) {
  const url=new URL(request.url); const code=url.searchParams.get("code");const requested=url.searchParams.get("next")??"/app";const next=requested.startsWith("/")&&!requested.startsWith("//")?requested:"/app";
  if(code) { const supabase=await createClient(); const { error }=await supabase.auth.exchangeCodeForSession(code); if(!error) return NextResponse.redirect(new URL(next,url)); }
  return NextResponse.redirect(new URL("/login?error=Authentication%20link%20is%20invalid%20or%20expired.",url));
}
