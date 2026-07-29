import "server-only";
export const LINKEDIN_DEFAULT_VERSION="202607";
export const LINKEDIN_SCOPES=["openid","profile","r_ads","r_ads_reporting","r_organization_admin","r_organization_social"] as const;
export const LINKEDIN_LIMITS={assets:25,pages:20,rows:5000,retries:2,timeoutMs:15_000,initialDays:90,reconcileDays:7}as const;
export function linkedinEnv(){const clientId=process.env.LINKEDIN_CLIENT_ID,clientSecret=process.env.LINKEDIN_CLIENT_SECRET,redirectUri=process.env.LINKEDIN_REDIRECT_URI,version=process.env.LINKEDIN_API_VERSION||LINKEDIN_DEFAULT_VERSION;if(!clientId||!clientSecret||!redirectUri)throw new Error("LinkedIn OAuth configuration is incomplete.");if(!/^\d{6}$/.test(version))throw new Error("LINKEDIN_API_VERSION must use YYYYMM format.");return{clientId,clientSecret,redirectUri,version}}
