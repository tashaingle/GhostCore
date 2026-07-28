import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {decryptToken} from "@/lib/security/token-crypto";
import {GoogleAnalyticsClient} from "@/lib/integrations/google-analytics/client";
import {selectGoogleAnalyticsProperty} from "@/app/google-analytics-actions";
import {Notice} from "@/components/notice";
export default async function GoogleAnalyticsProperties({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const ctx=await getActiveOrganisation();if(!ctx)return null;requireOrganisationAdmin(ctx.membership.role);const params=await searchParams;
  const {data:integration}=await ctx.supabase.from("integrations").select("id,access_token_encrypted,refresh_token_encrypted,token_expires_at,settings").eq("organisation_id",ctx.organisation.id).eq("provider","google_analytics").order("created_at").limit(1).maybeSingle();
  if(!integration?.access_token_encrypted)return <section className="space-y-4"><h2 className="text-2xl font-bold">Choose GA4 property</h2><p className="error">Connect Google Analytics before selecting a property.</p><Link className="button" href="/api/integrations/google-analytics/connect">Connect Google Analytics</Link></section>;
  let properties:Awaited<ReturnType<GoogleAnalyticsClient["discoverProperties"]>>=[];let error:string|undefined;
  try{const client=new GoogleAnalyticsClient({accessToken:decryptToken(integration.access_token_encrypted),refreshToken:integration.refresh_token_encrypted?decryptToken(integration.refresh_token_encrypted):undefined,expiresAt:integration.token_expires_at??undefined});properties=await client.discoverProperties()}catch(cause){error=cause instanceof Error?cause.message:"Analytics properties could not be loaded."}
  const settings=integration.settings as {propertyId?:string};
  return <section className="mx-auto max-w-3xl space-y-6"><div><h2 className="text-2xl font-bold">Choose Google Analytics 4 property</h2><p className="text-zinc-600">Select one GA4 property for this organisation. Universal Analytics properties are not shown.</p></div><Notice searchParams={params}/>{error&&<p className="error">{error}</p>}
    {!error&&!properties.length?<div className="card space-y-3"><p>No GA4 properties are available. Confirm the account has Analytics access and the Analytics Admin API is enabled.</p><Link className="button button-secondary" href="/api/integrations/google-analytics/connect">Reauthorise</Link></div>:properties.length>0&&<form action={selectGoogleAnalyticsProperty} className="space-y-3">{properties.map(property=><label className="card flex cursor-pointer items-start gap-3" key={property.propertyId}><input type="radio" name="propertyId" value={property.propertyId} defaultChecked={settings.propertyId===property.propertyId} required/><span><strong>{property.propertyName}</strong><span className="block text-sm text-zinc-500">{property.accountName} · Property {property.propertyId}</span></span></label>)}<div className="flex gap-3"><button className="button">Save property</button><Link className="button button-secondary" href="/app/integrations">Cancel</Link></div></form>}
  </section>;
}
