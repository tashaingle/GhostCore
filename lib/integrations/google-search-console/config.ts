import "server-only";
export const GSC_SCOPE="openid email https://www.googleapis.com/auth/webmasters.readonly";
export const GSC_LIMITS={properties:10,rowsPerProperty:250,inspectionUrlsPerProperty:10,requests:50,runtimeMs:25_000,initialDays:90,comparisonDays:7} as const;
export function gscOAuthEnv(){const clientId=process.env.GOOGLE_CLIENT_ID,clientSecret=process.env.GOOGLE_CLIENT_SECRET,redirectUri=process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI;if(!clientId||!clientSecret||!redirectUri)throw new Error("Google Search Console OAuth configuration is incomplete.");return{clientId,clientSecret,redirectUri}}
