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
import {GoogleSearchConsoleConnector} from "./google-search-console/connector";import {SearchConsoleClient} from "./google-search-console/client";import type{SearchConsoleSettings}from"./google-search-console/types";
import{ShopifyConnector}from"./shopify/connector";import{ShopifyClient}from"./shopify/client";import type{ShopifySettings}from"./shopify/types";
import{MetaAdsConnector}from"./meta-ads/connector";import{MetaAdsClient}from"./meta-ads/client";import type{MetaAdsSettings}from"./meta-ads/types";
import{LinkedInConnector}from"./linkedin/connector";import{LinkedInClient}from"./linkedin/client";import type{LinkedInSettings}from"./linkedin/types";
import{ManualConnector}from"./manual/connector";
import{NotionConnector}from"./notion/connector";import{NotionClient}from"./notion/client";import type{NotionSettings}from"./notion/types";
import{SlackConnector}from"./slack/connector";import{SlackClient}from"./slack/client";import type{SlackSettings}from"./slack/types";
export type ConnectorCredentials={accessToken?:string;refreshToken?:string;expiresAt?:string;settings?:Record<string,unknown>};
export function loadConnector(providerId:string,input?:string|ConnectorCredentials):IntegrationConnector{
  const provider=getProvider(providerId);if(!provider)throw new Error(`Unknown integration provider: ${providerId}`);
  const credentials=typeof input==="string"?{accessToken:input}:input??{};
  if(provider.connector==="github"){if(!credentials.accessToken)throw new Error("GitHub credentials are missing.");return new GitHubConnector(new GitHubApi(credentials.accessToken))}
  if(provider.connector==="google_analytics"){if(!credentials.accessToken)throw new Error("Google Analytics credentials are missing.");return new GoogleAnalyticsConnector(new GoogleAnalyticsClient({accessToken:credentials.accessToken,refreshToken:credentials.refreshToken,expiresAt:credentials.expiresAt}),credentials.settings as GoogleAnalyticsSettings)}
  if(provider.connector==="google_search_console"){if(!credentials.accessToken)throw new Error("Search Console credentials are missing.");return new GoogleSearchConsoleConnector(new SearchConsoleClient({accessToken:credentials.accessToken,refreshToken:credentials.refreshToken,expiresAt:credentials.expiresAt}),credentials.settings as SearchConsoleSettings)}
  if(provider.connector==="gmail"){if(!credentials.accessToken)throw new Error("Gmail credentials are missing.");return new GmailConnector(new GmailClient({accessToken:credentials.accessToken,refreshToken:credentials.refreshToken,expiresAt:credentials.expiresAt}),credentials.settings as GmailSettings)}
  if(provider.connector==="google_calendar"){if(!credentials.accessToken)throw new Error("Google Calendar credentials are missing.");return new GoogleCalendarConnector(new CalendarClient({accessToken:credentials.accessToken,refreshToken:credentials.refreshToken,expiresAt:credentials.expiresAt}),credentials.settings as CalendarSettings)}
  if(provider.connector==="stripe"){const settings=credentials.settings as StripeSettings;if(!settings?.accountId||!settings?.mode)throw new Error("Stripe account configuration is missing.");return new StripeConnector(settings)}
  if(provider.connector==="shopify"){const settings=credentials.settings as ShopifySettings;if(!credentials.accessToken||!settings?.shop)throw new Error("Shopify credentials are missing.");return new ShopifyConnector(new ShopifyClient({shop:settings.shop,accessToken:credentials.accessToken,refreshToken:credentials.refreshToken,expiresAt:credentials.expiresAt}),settings)}
  if(provider.connector==="meta_ads"){const settings=credentials.settings as MetaAdsSettings;if(!credentials.accessToken)throw new Error("Meta Ads credentials are missing.");return new MetaAdsConnector(new MetaAdsClient(credentials.accessToken),settings)}
  if(provider.connector==="linkedin"){const settings=credentials.settings as LinkedInSettings;if(!credentials.accessToken)throw new Error("LinkedIn credentials are missing.");return new LinkedInConnector(new LinkedInClient(credentials.accessToken),settings)}
  if(provider.connector==="manual")return new ManualConnector()
  if(provider.connector==="notion"){if(!credentials.accessToken)throw new Error("Notion credentials are missing.");return new NotionConnector(new NotionClient(credentials.accessToken),credentials.settings as NotionSettings,credentials.refreshToken)}
  if(provider.connector==="slack"){if(!credentials.accessToken)throw new Error("Slack credentials are missing.");return new SlackConnector(new SlackClient(credentials.accessToken),credentials.settings as SlackSettings,credentials.refreshToken)}
  return new PlaceholderConnector(provider.id);
}
