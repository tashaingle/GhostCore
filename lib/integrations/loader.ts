import "server-only";
import type {IntegrationConnector} from "./connector";
import {getProvider} from "./registry";
import {PlaceholderConnector} from "./placeholder-connector";
import {GitHubConnector} from "./github/connector";
import {GitHubApi} from "./github/api";
import {GitHubAppConnector} from "./github/app-connector";
import {selectedRepositories} from "./github/selection";
import {githubAppEnv, installationToken} from "./github/app";
import {GoogleAnalyticsConnector, type GoogleAnalyticsSettings} from "./google-analytics/connector";
import {GoogleAnalyticsClient} from "./google-analytics/client";
import {GmailConnector} from "./gmail/connector";
import {GmailClient} from "./gmail/client";
import type {GmailSettings} from "./gmail/types";
import {OutlookConnector} from "./outlook/connector";
import {MailchimpConnector} from "./mailchimp/connector";
import {MailchimpClient} from "./mailchimp/client";
import type {MailchimpSettings} from "./mailchimp/types";
import {OutlookClient} from "./outlook/client";
import type {OutlookSettings} from "./outlook/types";
import {GoogleCalendarConnector} from "./google-calendar/connector";
import {CalendarClient} from "./google-calendar/client";
import type {CalendarSettings} from "./google-calendar/types";
import {StripeConnector, type StripeSettings} from "./stripe/connector";
import {GoogleSearchConsoleConnector} from "./google-search-console/connector";
import {SearchConsoleClient} from "./google-search-console/client";
import type {SearchConsoleSettings} from "./google-search-console/types";
import {ShopifyConnector} from "./shopify/connector";
import {ShopifyClient} from "./shopify/client";
import type {ShopifySettings} from "./shopify/types";
import {MetaAdsConnector} from "./meta-ads/connector";
import {MetaAdsClient} from "./meta-ads/client";
import type {MetaAdsSettings} from "./meta-ads/types";
import {MetaSocialConnector} from "./meta-social/connector";
import {MetaSocialClient} from "./meta-social/client";
import type {MetaSocialSettings} from "./meta-social/types";
import {LinkedInConnector} from "./linkedin/connector";
import {LinkedInClient} from "./linkedin/client";
import type {LinkedInSettings} from "./linkedin/types";
import {ManualConnector} from "./manual/connector";
import {NotionConnector} from "./notion/connector";
import {NotionClient} from "./notion/client";
import type {NotionSettings} from "./notion/types";
import {SlackConnector} from "./slack/connector";
import {SlackClient} from "./slack/client";
import type {SlackSettings} from "./slack/types";
import {VercelConnector} from "./vercel/connector";
import {VercelClient} from "./vercel/client";
import type {VercelSettings} from "./vercel/types";
import {TikTokConnector} from "./tiktok/connector";
import {TikTokClient} from "./tiktok/client";
import type {TikTokSettings} from "./tiktok/types";
import {GooglePlayConnector} from "./google-play/connector";
import {GooglePlayClient} from "./google-play/client";
import type {GooglePlaySettings} from "./google-play/types";
import {AppStoreConnector} from "./app-store/connector";
import {AppStoreClient} from "./app-store/client";
import {storedAppStoreKey} from "./app-store/key";
import type {AppStoreSettings} from "./app-store/types";
import {BusinessProfileConnector} from "./google-business-profile/connector";
import {BusinessProfileClient} from "./google-business-profile/client";
import type {BusinessProfileSettings} from "./google-business-profile/types";
import {GoogleAdsConnector} from "./google-ads/connector";
import {GoogleAdsClient} from "./google-ads/client";
import type {GoogleAdsSettings} from "./google-ads/types";
export type ConnectorCredentials = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  settings?: Record<string, unknown>;
};
export function loadConnector(
  providerId: string,
  input?: string | ConnectorCredentials,
): IntegrationConnector {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown integration provider: ${providerId}`);
  const credentials = typeof input === "string" ? {accessToken: input} : (input ?? {});
  if (provider.connector === "github") {
    // GitHub App installations mint a short-lived token per sync; older connections use OAuth.
    const installationId = credentials.settings?.installationId;
    if (typeof installationId === "string" && installationId) {
      const env = githubAppEnv();
      if (!env) throw new Error("GitHub App configuration is incomplete.");
      return new GitHubAppConnector(
        async () => new GitHubApi(await installationToken(env, installationId)),
        selectedRepositories(credentials.settings),
      );
    }
    if (!credentials.accessToken) throw new Error("GitHub credentials are missing.");
    return new GitHubConnector(new GitHubApi(credentials.accessToken));
  }
  if (provider.connector === "google_analytics") {
    if (!credentials.accessToken) throw new Error("Google Analytics credentials are missing.");
    return new GoogleAnalyticsConnector(
      new GoogleAnalyticsClient({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      }),
      credentials.settings as GoogleAnalyticsSettings,
    );
  }
  if (provider.connector === "google_search_console") {
    if (!credentials.accessToken) throw new Error("Search Console credentials are missing.");
    return new GoogleSearchConsoleConnector(
      new SearchConsoleClient({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      }),
      credentials.settings as SearchConsoleSettings,
    );
  }
  if (provider.connector === "mailchimp") {
    const settings = (credentials.settings ?? {}) as MailchimpSettings;
    if (!credentials.accessToken || !settings.apiEndpoint)
      throw new Error("Mailchimp credentials are missing. Connect Mailchimp again.");
    return new MailchimpConnector(
      new MailchimpClient(credentials.accessToken, settings.apiEndpoint),
      settings,
    );
  }
  if (provider.connector === "outlook") {
    if (!credentials.accessToken) throw new Error("Outlook credentials are missing.");
    return new OutlookConnector(
      new OutlookClient({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      }),
      credentials.settings as OutlookSettings,
    );
  }
  if (provider.connector === "gmail") {
    if (!credentials.accessToken) throw new Error("Gmail credentials are missing.");
    return new GmailConnector(
      new GmailClient({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      }),
      credentials.settings as GmailSettings,
    );
  }
  if (provider.connector === "google_calendar") {
    if (!credentials.accessToken) throw new Error("Google Calendar credentials are missing.");
    return new GoogleCalendarConnector(
      new CalendarClient({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      }),
      credentials.settings as CalendarSettings,
    );
  }
  if (provider.connector === "stripe") {
    const settings = credentials.settings as StripeSettings;
    if (!settings?.accountId || !settings?.mode)
      throw new Error("Stripe account configuration is missing.");
    return new StripeConnector(settings);
  }
  if (provider.connector === "shopify") {
    const settings = credentials.settings as ShopifySettings;
    if (!credentials.accessToken || !settings?.shop)
      throw new Error("Shopify credentials are missing.");
    return new ShopifyConnector(
      new ShopifyClient({
        shop: settings.shop,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      }),
      settings,
    );
  }
  if (provider.connector === "meta_ads") {
    const settings = credentials.settings as MetaAdsSettings;
    if (!credentials.accessToken) throw new Error("Meta Ads credentials are missing.");
    return new MetaAdsConnector(new MetaAdsClient(credentials.accessToken), settings);
  }
  if (provider.connector === "meta_social") {
    const settings = credentials.settings as MetaSocialSettings;
    if (!credentials.accessToken) throw new Error("Meta Social credentials are missing.");
    return new MetaSocialConnector(new MetaSocialClient(credentials.accessToken), settings);
  }
  if (provider.connector === "linkedin") {
    const settings = credentials.settings as LinkedInSettings;
    if (!credentials.accessToken) throw new Error("LinkedIn credentials are missing.");
    return new LinkedInConnector(new LinkedInClient(credentials.accessToken), settings);
  }
  if (provider.connector === "manual") return new ManualConnector();
  if (provider.connector === "notion") {
    if (!credentials.accessToken) throw new Error("Notion credentials are missing.");
    return new NotionConnector(
      new NotionClient(credentials.accessToken),
      credentials.settings as NotionSettings,
      credentials.refreshToken,
    );
  }
  if (provider.connector === "slack") {
    if (!credentials.accessToken) throw new Error("Slack credentials are missing.");
    return new SlackConnector(
      new SlackClient(credentials.accessToken),
      credentials.settings as SlackSettings,
      credentials.refreshToken,
    );
  }
  if (provider.connector === "vercel") {
    if (!credentials.accessToken) throw new Error("Vercel credentials are missing.");
    return new VercelConnector(
      new VercelClient(credentials.accessToken),
      (credentials.settings ?? {}) as VercelSettings,
    );
  }
  if (provider.connector === "tiktok") {
    if (!credentials.accessToken) throw new Error("TikTok credentials are missing.");
    return new TikTokConnector(
      new TikTokClient({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      }),
      (credentials.settings ?? {}) as TikTokSettings,
    );
  }
  if (provider.connector === "google_play") {
    if (!credentials.accessToken) throw new Error("Google Play credentials are missing.");
    return new GooglePlayConnector(
      new GooglePlayClient({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      }),
      (credentials.settings ?? {}) as GooglePlaySettings,
    );
  }
  if (provider.connector === "app_store") {
    // The access token column holds the encrypted App Store Connect key, not an OAuth token.
    if (!credentials.accessToken) throw new Error("App Store credentials are missing.");
    return new AppStoreConnector(
      new AppStoreClient(storedAppStoreKey(credentials.accessToken)),
      (credentials.settings ?? {}) as AppStoreSettings,
    );
  }
  if (provider.connector === "google_business_profile") {
    if (!credentials.accessToken)
      throw new Error("Google Business Profile credentials are missing.");
    return new BusinessProfileConnector(
      new BusinessProfileClient({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      }),
      (credentials.settings ?? {}) as BusinessProfileSettings,
    );
  }
  if (provider.connector === "google_ads") {
    if (!credentials.accessToken) throw new Error("Google Ads credentials are missing.");
    return new GoogleAdsConnector(
      new GoogleAdsClient({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      }),
      (credentials.settings ?? {}) as GoogleAdsSettings,
    );
  }
  return new PlaceholderConnector(provider.id);
}
