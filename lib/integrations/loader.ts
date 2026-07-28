import "server-only";
import type {IntegrationConnector} from "./connector";
import {getProvider} from "./registry";
import {PlaceholderConnector} from "./placeholder-connector";
import {GitHubConnector} from "./github/connector";
import {GitHubApi} from "./github/api";
import {GoogleAnalyticsConnector,type GoogleAnalyticsSettings} from "./google-analytics/connector";
import {GoogleAnalyticsClient} from "./google-analytics/client";
import {GmailConnector} from "./gmail/connector";
import {GmailClient} from "./gmail/client";
import type {GmailSettings} from "./gmail/types";
import {GoogleCalendarConnector} from "./google-calendar/connector";import {CalendarClient} from "./google-calendar/client";import type{CalendarSettings}from"./google-calendar/types";
import {StripeConnector,type StripeSettings} from "./stripe/connector";
export type ConnectorCredentials={accessToken?:string;refreshToken?:string;expiresAt?:string;settings?:Record<string,unknown>};
export function loadConnector(providerId:string,input?:string|ConnectorCredentials):IntegrationConnector{
  const provider=getProvider(providerId);if(!provider)throw new Error(`Unknown integration provider: ${providerId}`);
  const credentials=typeof input==="string"?{accessToken:input}:input??{};
  if(provider.connector==="github"){if(!credentials.accessToken)throw new Error("GitHub credentials are missing.");return new GitHubConnector(new GitHubApi(credentials.accessToken))}
  if(provider.connector==="google_analytics"){if(!credentials.accessToken)throw new Error("Google Analytics credentials are missing.");return new GoogleAnalyticsConnector(new GoogleAnalyticsClient({accessToken:credentials.accessToken,refreshToken:credentials.refreshToken,expiresAt:credentials.expiresAt}),credentials.settings as GoogleAnalyticsSettings)}
  if(provider.connector==="gmail"){if(!credentials.accessToken)throw new Error("Gmail credentials are missing.");return new GmailConnector(new GmailClient({accessToken:credentials.accessToken,refreshToken:credentials.refreshToken,expiresAt:credentials.expiresAt}),credentials.settings as GmailSettings)}
  if(provider.connector==="google_calendar"){if(!credentials.accessToken)throw new Error("Google Calendar credentials are missing.");return new GoogleCalendarConnector(new CalendarClient({accessToken:credentials.accessToken,refreshToken:credentials.refreshToken,expiresAt:credentials.expiresAt}),credentials.settings as CalendarSettings)}
  if(provider.connector==="stripe"){const settings=credentials.settings as StripeSettings;if(!settings?.accountId||!settings?.mode)throw new Error("Stripe account configuration is missing.");return new StripeConnector(settings)}
  return new PlaceholderConnector(provider.id);
}
