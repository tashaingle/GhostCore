export const GA4_SCOPES=["openid","email","https://www.googleapis.com/auth/analytics.readonly"] as const;
export const GA4_THRESHOLDS={minimumSessions:100,minimumSessionDifference:30,minimumPercentageChange:20,severeDeclinePercentage:50,minimumConversions:5,minimumConversionDifference:2,minimumEngagementRateDifference:5,minimumDimensionSessions:20,minimumLandingPageSessions:30,landingPagePercentageChange:40} as const;
export function googleOAuthEnv(){
  const clientId=process.env.GOOGLE_CLIENT_ID?.trim(),clientSecret=process.env.GOOGLE_CLIENT_SECRET?.trim(),redirectUri=process.env.GOOGLE_ANALYTICS_REDIRECT_URI?.trim();
  if(!clientId||!clientSecret||!redirectUri)throw new Error("Google Analytics OAuth is not configured.");
  const url=new URL(redirectUri);if(!["http:","https:"].includes(url.protocol))throw new Error("GOOGLE_ANALYTICS_REDIRECT_URI must be an HTTP(S) URL.");
  return{clientId,clientSecret,redirectUri:url.toString()};
}
