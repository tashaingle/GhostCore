# Ghost Core

Backend-first SaaS MVP that normalises activity from business tools into one organisation-scoped event stream.

## MVP features

- Email registration, confirmation callback, sign-in, sign-out, session refresh, and protected routes
- Atomic organisation onboarding with owner membership
- Real overview metrics; searchable, filterable, paginated timeline
- Test integration records without token collection
- Production GitHub OAuth connection, manual sync, disconnect, encrypted credentials, and event translation
- Registry-driven integration platform, capability-aware dashboard, reusable sync runner, health states, schedules, and persistent connector logs
- Validated event generator and idempotent eight-event demo dataset
- Authenticated `GET/POST /api/events` and `POST /api/developer/seed-events`
- Typed event model, ingestion service, connector/translator interfaces, RLS-aware access

Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase SSR/Auth/Postgres, Zod, Vitest.

## Setup

1. Run `npm install`.
2. Copy values into an uncommitted `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   GITHUB_TOKEN_ENCRYPTION_KEY=base64-encoded-32-byte-key
   GOOGLE_CLIENT_ID=your-google-oauth-client-id
   GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
   GOOGLE_ANALYTICS_REDIRECT_URI=http://localhost:3000/auth/google-analytics/callback
   ```

3. Apply `supabase/migrations/202607280001_mvp_support.sql` using the Supabase SQL Editor, or link the Supabase CLI and run `supabase db push`.
4. In Supabase Auth, add `http://localhost:3000/auth/callback` to redirect URLs.
   Also add `http://localhost:3000/auth/github/callback` for the GitHub connection flow.
5. Run `npm run dev`, then register. If email confirmation is enabled, confirm before signing in.

Generate the encryption key once and keep it only in server environment configuration:

```bash
openssl rand -base64 32
```

Changing this key makes existing GitHub credentials unreadable, so users must reconnect.

## GitHub OAuth setup

1. In GitHub, create an OAuth App. Set its homepage to your Ghost deployment URL.
2. Set the GitHub OAuth App **Authorization callback URL** to the callback displayed in Supabase Authentication → Providers → GitHub. For the hosted project it is `https://<project-ref>.supabase.co/auth/v1/callback` (not the Ghost callback route).
3. Copy the GitHub Client ID and Client Secret into the GitHub provider configuration in Supabase and enable it.
4. Enable **Manual identity linking** in Supabase Authentication settings.
5. Add `https://your-ghost-domain/auth/github/callback` (and the localhost equivalent during development) to Supabase Authentication's redirect allow list.
6. Set `NEXT_PUBLIC_SITE_URL` to the exact Ghost origin and set `GITHUB_TOKEN_ENCRYPTION_KEY` in the server environment.

Ghost requests `read:user repo` so it can identify the account and read private repository activity and Actions runs. GitHub's classic `repo` scope is broad; a future GitHub App is recommended for finer-grained production permissions. Provider tokens are captured only by the server callback, verified with `GET /user`, encrypted using AES-256-GCM, and never returned to client code.

On Integrations, choose **Connect GitHub**, complete authorization, then choose **Sync now**. Sync imports up to 100 recent account activity records and up to 10 workflow runs for each of at most 10 repositories present in that activity. It translates pushes, opened/merged pull requests, opened issues, published releases, and completed workflows. GitHub's activity feed can lag, and only its recent window is available. Repeated syncs are safe because external identities are deterministic and protected by the existing unique index.

If Connect GitHub reports that the provider is disabled, query the Supabase project's Auth settings or reopen Authentication → Providers → GitHub and confirm the **GitHub Enabled** switch itself is on after saving the credentials. Saving a Client ID and secret does not necessarily enable the provider. In development, OAuth-start and callback failures include Supabase's safe error message and code; credentials and tokens are never logged.

Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Event engine

`createEvent` normalises and validates input, verifies user membership and optional integration ownership, checks the `(organisation, source, external ID)` identity, and inserts through the user-scoped Supabase client. The partial unique index closes concurrent duplicate races. The UI never renders raw payloads. Metadata is displayed as escaped JSON.

Connectors implement `IntegrationConnector`; provider-specific translators implement `EventTranslator`. The GitHub connector is the first production implementation: it fetches GitHub records, translates supported records, and passes each normalised event to `createEvent`. The manual translator remains the minimal reference.

## Integration platform

`lib/integrations/registry.ts` is the single catalogue for provider identity, presentation, capabilities, connector availability, OAuth metadata, and recommended schedule. The dashboard renders every card from this registry. GitHub is active; Google Analytics, Gmail, Google Calendar, Stripe, Shopify, Meta Ads, LinkedIn, Notion, and Slack are declared extension points; Manual routes to Developer Tools.

Every runtime connector implements `connect`, `disconnect`, `refresh`, `sync`, `healthCheck`, and `translate`. Connectors fetch and translate only—they never write business events. `runIntegrationSync` loads the correct connector, validates health, requests a batch of normalised events, passes those events through the universal event engine, counts imports/duplicates/unsupported records/errors, updates integration status, and writes a separate integration log.

To add a provider:

1. Add its definition and capabilities to `registry.ts`.
2. Create an API client and isolated translator folder under `lib/integrations/<provider>`.
3. Implement the connector SDK without database writes.
4. Register its constructor in `loader.ts`.
5. Add a secure OAuth callback or credential setup path based on the registry metadata.
6. Add translator, connector, loader, and sync-runner tests.

Scheduling is declarative only. Providers choose `manual`, `hourly`, `daily`, or `webhook` plus a human-readable recommendation. A future worker can enumerate connected integrations from the registry and invoke the same sync runner; no cron or queue is included yet.

Apply `supabase/migrations/202607280002_integration_logs.sql` before syncing. It adds the RLS-protected `integration_logs` table used for started/finished state, duration, received/imported/skipped/error counts, and rate-limit reporting.

## Google Analytics 4

GA4 uses a direct server-side Google authorization-code flow with state, PKCE, an exact redirect URI, and offline access. This was chosen instead of Supabase identity linking because Google Analytics needs a durable refresh token and Supabase does not manage provider-token refresh. Google client credentials, code exchange, provider tokens, discovery, and reporting never enter client-rendered data. Access and refresh tokens use the existing AES-256-GCM storage.

### Google Cloud setup

1. Create or select a project in Google Cloud Console.
2. Enable both **Google Analytics Data API** and **Google Analytics Admin API**.
3. Configure the OAuth consent screen. Choose Internal only for a Google Workspace organisation whose users should be the sole users; otherwise choose External.
4. If External remains in Testing, add every Google account that will connect as a test user. Refresh tokens for testing apps may have shorter lifetimes.
5. Add only these scopes: `openid`, `email`, and `https://www.googleapis.com/auth/analytics.readonly`.
6. Create an OAuth 2.0 Client ID with application type **Web application**.
7. Add `http://localhost:3000` as an authorised JavaScript origin if Google requests one. Ghost itself performs OAuth on the server and does not depend on browser Google SDKs.
8. Add this exact authorised redirect URI:

   ```text
   http://localhost:3000/auth/google-analytics/callback
   ```

9. Put the client ID, client secret, and exact URI in `.env.local` using the variables above, then restart `npm run dev`.

For deployment, add the HTTPS production callback to the same Google OAuth client and set `GOOGLE_ANALYTICS_REDIRECT_URI` to that exact value. Common `redirect_uri_mismatch` causes are a missing port, HTTP versus HTTPS, a trailing slash, a different hostname, or changing the environment variable without restarting the server. Publish/verify the consent screen when leaving testing, following Google's current sensitive-scope verification requirements.

### Property selection and sync

Connect Google Analytics from Integrations, approve only the read-only Analytics permission, and choose one discovered GA4 property. Account name, property name/ID, and property time zone are saved as non-secret integration settings. Change property does not delete historical events. Reauthorise replaces credentials; Disconnect attempts token revocation, clears encrypted credentials, and retains historical events.

Sync fetches aggregate-only GA4 reports for the latest seven complete property-local days and the preceding seven days. Metrics include active users, sessions, new/total users, engaged sessions, engagement rate, average session duration, event count, key events, page views, default channel group, source/medium, and landing page. No user-level or PII report is requested.

Generated event types:

- `analytics.traffic_increased` / `analytics.traffic_decreased`
- `analytics.conversions_increased` / `analytics.conversions_decreased`
- `analytics.engagement_rate_changed`
- `analytics.organic_traffic_changed`
- `analytics.paid_traffic_changed`
- `analytics.referral_spike`
- `analytics.new_source_detected`
- `analytics.landing_page_surged` / `analytics.landing_page_declined`
- `analytics.tracking_inactive`

Thresholds live in `lib/integrations/google-analytics/config.ts`. Defaults require at least 100 baseline sessions, a 30-session absolute change and 20% relative change; conversion rules require at least five baseline key events and a difference of two; dimension and landing-page rules use their own conservative minimums. Tracking inactivity requires zero sessions after at least 100 baseline sessions. Metadata records inputs, periods, time zone, calculated changes, and thresholds. External IDs include property, rule, metric/dimension, and completed period, making repeat syncs duplicate-safe.

### Manual GA4 verification

1. Complete the Google Cloud setup above and restart development.
2. Sign into Ghost as an organisation owner or admin.
3. Connect Google Analytics and approve only requested permissions.
4. Select a GA4 property.
5. Choose Sync now and inspect the Integration log.
6. Confirm meaningful events appear in Timeline and contribute to Overview.
7. Sync again and confirm existing completed-period events are skipped.
8. Revoke Ghost access in the Google Account security page, sync, and confirm an expired/error state.
9. Reauthorise, then change property if needed.
10. Disconnect and confirm credentials are cleared while historical Timeline events remain.

Known limitations: sync is manual, the reporting comparison is a conservative rolling 7-day model, only one property per organisation is active, report dimensions are bounded to 1,000 aggregate rows, and Google quota availability is external. Scheduling and webhooks remain framework-only.

## Security and limitations

RLS stays enabled. No service-role key, browser token input, `dangerouslySetInnerHTML`, or public ingestion endpoint exists. All organisation IDs originate from server-validated membership. GitHub tokens use authenticated server-side encryption and token columns are cleared on disconnect. The migration is additive and the original core tables/policies are assumed to exist remotely.

Live auth and RLS require configured credentials. Manually test isolation with two users: create separate organisations, add events/integrations in each, confirm neither appears in the other account, and directly query each table from both authenticated sessions. GitHub sync is manual and bounded; it does not use webhooks or background jobs. Organisation switching, invitations, other OAuth providers, queues, scheduled sync, billing, and AI are intentionally out of scope. Regenerate database types later with `npx supabase gen types typescript --linked > types/database.ts`.
# Intelligence Engine (Phase 5)

Ghost now turns normalised events into deterministic, explainable insights. The engine is provider-independent: connectors still translate provider records into the universal `events` table, while isolated intelligence rules inspect those events and return insight candidates. The shared runner owns confidence clamping, fingerprints, duplicate-safe persistence, lifecycle updates, and recovery resolution.

## How intelligence works

Rules live under `lib/intelligence/rules`. Each rule declares a stable ID, priority, supported event providers, and a pure `evaluate(events)` function. Rules return a title, summary, severity, confidence (0–100), explanation, recommendation, evidence event IDs, and a deterministic fingerprint key. They never access Supabase or insert rows.

`runIntelligence` loads a rolling 30-day event window, evaluates the registry, and writes to `insights`. Repeated reasoning updates the matching `(organisation_id, fingerprint)` record instead of creating duplicates. Dismissed or resolved insight status is preserved on subsequent evaluation. An analytics recovery signal resolves active analytics-decline insights.

The initial rules cover deployments followed by traffic decline, failed workflows before traffic decline, traffic decline with stable conversions, repeated workflow failures, inactive analytics tracking, and analytics recovery. Thresholds are centralized in `lib/intelligence/config.ts`.

Intelligence runs after a successful integration sync and can also be started from **Overview → Run intelligence**. Overview, insight detail, and the combined Timeline query the universal insight model; there is no provider-specific dashboard.

## Insight API

- `GET /api/insights` lists organisation-scoped insights (`status`, `severity`, and `limit` are optional).
- `GET /api/insights/:id` returns an insight with supporting events.
- `POST /api/insights/:id/acknowledge`
- `POST /api/insights/:id/dismiss`
- `POST /api/insights/:id/resolve`

All endpoints require the current Supabase session and retain RLS organisation isolation.

## Database setup for Phase 5

Apply `supabase/migrations/202607280003_insights.sql` after the Phase 1–4 migrations. It creates the RLS-protected `insights` table, lifecycle and confidence constraints, evidence IDs, and a unique organisation/fingerprint constraint. Phase 5 adds no environment variables.

## Adding an intelligence rule

1. Add a pure module below `lib/intelligence/rules/<domain>`.
2. Use normalised event types—not connector credentials or provider APIs.
3. Return evidence IDs and a stable fingerprint key.
4. Register the rule in `lib/intelligence/rules/index.ts`.
5. Put all configurable thresholds in `lib/intelligence/config.ts`.
6. Add deterministic unit tests for positive, negative, confidence, and duplicate cases.
# Multi-organisation workspaces (Phase 6)

One authenticated account can belong to multiple isolated organisations. The active workspace is resolved on the server from an HTTP-only `ghost_active_organisation` cookie, checked against active membership on every request, and backed by `profiles.active_organisation_id` so it survives login on another browser. If access disappears, Ghost safely selects the oldest remaining active membership.

The sidebar switcher submits a server action; it never treats client state as an authorization boundary. All dashboard, timeline, insight, integration, log, developer-tool and settings queries use the resulting organisation ID. OAuth callbacks also resolve the selected organisation, so credentials cannot land in a different workspace.

## Roles and permissions

Permissions are defined centrally in `lib/auth/permissions.ts`.

- Owner: all workspace and team operations.
- Admin: organisation settings, invitations, members, integrations, sync, events and insights.
- Manager: operational sync, event and insight operations; no organisation/team administration.
- Member: normal event and insight usage.
- Viewer: read-only.

Server actions and APIs validate permissions. Phase 6 RLS independently limits every business record by active organisation membership and restricts writes by role.

## Invitations

Owners and admins invite an email and select a non-owner role. Ghost stores only a SHA-256 token hash, expires invitations after seven days, and asks Supabase Auth to send a magic-link email whose safe callback returns to `/invite/<token>`. The invited user must authenticate as the invited email. Acceptance is an atomic security-definer function that checks email, expiry and duplicate membership, adds the membership, marks the invitation accepted and selects the new workspace.

Pending invitations can be resent (rotating the token and expiry) or cancelled. Duplicate pending invitations and existing members are rejected.

## Database setup

Apply `supabase/migrations/202607280004_multi_organisation.sql`. It adds organisation settings, the persisted profile preference, Manager role and member status, the invitation table/functions, teammate profile visibility, and canonical tenant RLS policies. No new environment variables are required. Supabase Auth email delivery and the existing `NEXT_PUBLIC_SITE_URL` must be configured.

## Developer guidance

Use `getActiveOrganisation()` in server pages/actions and `organisationApiContext()` in route handlers. Never accept an organisation ID from an untrusted body as the authority. Always scope provider credentials, events, logs and insights with `ctx.organisation.id` or `ctx.organisationId`, and check a named permission before mutations. Future billing, portals and agency reporting should attach to `organisation_id`; cross-organisation access must be an explicit separate capability.
# Gmail integration (Phase 7)

Gmail is a real connector in the provider registry and shared sync runner. It uses Google OAuth 2.0 with PKCE, a ten-minute state cookie tied to the server-resolved active organisation, and only `openid`, `email`, and `https://www.googleapis.com/auth/gmail.readonly`. Google credentials are reused through `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; `GMAIL_REDIRECT_URI` defaults to `${NEXT_PUBLIC_SITE_URL}/api/integrations/gmail/callback`.

The first sync searches only the last seven days, excludes Spam and Trash, requests at most five pages and 250 messages, and fetches metadata format only. Later syncs use `users.history.list` and the stored history ID; an invalid history cursor falls back to the bounded recent query. Cursors update only after a successful connector run. Each mailbox is a separate integration record with independent encrypted access/refresh tokens, expiry, settings, health, cursor and logs.

Ghost stores subjects, safe address metadata, direction, labels, unread/starred flags, attachment filenames/counts and optionally a 200-character Gmail snippet. Snippets are off by default. It never downloads bodies, HTML, embedded images, attachments or remote links. Provider strings are control-character stripped, angle-bracket stripped and length bounded. Tokens, authorization codes and private snippets are never logged.

Events are `gmail.message_received` and `gmail.message_sent`. External IDs include integration ID, Gmail message ID and event type, so reruns and multiple mailboxes remain duplicate-safe. Spam/Trash and disabled directions are filtered. Gmail `IMPORTANT` remains metadata and is not intelligence.

## Google Cloud setup

1. Enable Gmail API in the existing Google Cloud project.
2. Add the Gmail read-only scope to the OAuth consent screen.
3. Add `http://localhost:3000/api/integrations/gmail/callback` (or `GMAIL_REDIRECT_URI`) as an authorized redirect URI.
4. Add required consent-screen test users while the app is in testing.
5. Re-authorize accounts when adding the new scope.
6. Google Workspace administrators may need to approve Gmail read-only access.

Gmail will not work until those steps are complete. Safe defaults enable received, sent, unread and attachment metadata; snippets are disabled. The integration settings page supports each connected mailbox independently. Syncs are protected by a provider-agnostic ten-minute database lock that is released on completion/failure and expires after interrupted jobs.
# Google Calendar integration (Phase 8)

Google Calendar is a read-only connector using the shared registry, encrypted credentials, organisation context, sync runner, logs and Phase 7 locks. OAuth uses PKCE/state cookies bound to the active organisation and the narrower `calendar.events.readonly` plus `calendar.calendarlist.readonly` scopes with `openid email`; no write scope is requested.

OAuth discovery stores up to 50 safe calendar descriptors. Primary and owned calendars default selected, except birthday/holiday calendars; shared/resource calendars default unselected. Each integration supports up to 20 selected calendars, five pages and 1,000 events per calendar. Full sync is bounded to 30 days past and 90 days ahead. Per-calendar sync tokens drive increments; HTTP 410 triggers a bounded full resync. Recurring instances use Google instance IDs, all-day events preserve exclusive date ends, and provider timezones remain metadata.

The connector emits `google_calendar.event_created`, `google_calendar.event_updated`, and `google_calendar.event_cancelled`. A bounded settings fingerprint map prevents unchanged events becoming updates; external IDs include integration, calendar, event, type and update fingerprint. Titles/locations/descriptions are sanitized and bounded. Descriptions are off by default; attendee lists, attachments, private properties and meeting access data are never stored.

Set `GOOGLE_CALENDAR_REDIRECT_URI` or use the documented localhost default. In Google Cloud enable Calendar API, add both read-only scopes, register `http://localhost:3000/api/integrations/google-calendar/callback`, retain Gmail/GA4 callbacks, configure test users, reauthorise, and obtain Workspace admin approval where required.
# Phase 9: read-only Stripe

Stripe is a first-class connector in the provider registry. It connects existing Standard accounts with Stripe Connect OAuth, requests only `scope=read_only`, performs a bounded Events API import (30 days, 10 pages, 1,000 events), then reconciles the previous 72 hours. The verified Connect webhook feeds the same translator and universal event table; it stores only a minimal receipt, never a raw webhook.

Set `STRIPE_PLATFORM_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_REDIRECT_URI`, `STRIPE_WEBHOOK_SECRET`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. The pinned SDK is `stripe@22.0.0`; the explicit API version is `2026-03-25.dahlia`. Production refuses a `sk_test_` platform key.

In Stripe Dashboard, configure Connect for Standard accounts, add the exact development redirect `http://localhost:3000/api/integrations/stripe/callback`, and later add the production HTTPS equivalent. Add a Connect webhook endpoint at `https://your-production-domain/api/webhooks/stripe`, select “Events on connected accounts”, and subscribe only to the event names in `lib/integrations/stripe/config.ts`. Copy its distinct signing secret to the server environment. Start in test mode.

For local webhook testing:

```powershell
stripe login
stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe
```

Use the temporary `whsec_...` printed by that command only in local `.env.local`. The CLI’s fixtures do not reproduce every connected-account event.

PaymentIntent is the canonical successful/failed/cancelled payment lifecycle source. `charge.succeeded` and `charge.failed` are deliberately ignored. Checkout, invoice and subscription events remain lifecycle facts and do not add revenue. Monetary values remain integer minor units, include ISO currency, are grouped by currency by consumers, and are never converted. Customer IDs are one-way pseudonyms; emails, addresses, metadata, descriptions, payment methods, card/bank details, and raw Stripe objects are not persisted.

Apply `supabase/migrations/202607280006_stripe_integration.sql` before connecting Stripe. Owners/admins connect and disconnect; roles with `integration.sync` may reconcile. Disconnect clears local credentials while preserving historical events and receipts. Webhook processing is bounded and synchronous because Ghost does not yet have a durable job queue.
# Phase 10: Google Search Console

Search Console is a read-only connector in the shared provider registry. It reuses Google OAuth with PKCE, encrypted access/refresh tokens, organisation-bound callback cookies, provider-independent locks, the sync runner, logs and universal events. Required scope: `openid email https://www.googleapis.com/auth/webmasters.readonly`; no write scope is requested.

Enable **Google Search Console API** in the existing Google Cloud project, add the readonly scope to the OAuth consent screen, and register the exact redirect URI `http://localhost:3000/api/integrations/google-search-console/callback`. Set `GOOGLE_SEARCH_CONSOLE_REDIRECT_URI` server-side alongside the existing `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

After connecting, `/app/integrations/google-search-console/properties` discovers Domain (`sc-domain:`) and URL-prefix properties, records their permission level, and lets an Owner/Admin select up to ten per Google account. Multiple Google accounts can create independent integrations. Managers can sync through the existing permission framework; Members/Viewers remain read-only.

Initial sync compares two bounded 45-day halves covering 90 days; later syncs compare complete seven-day periods after Search Console's three-day data delay. Limits are 10 selected properties, 250 final Search Analytics rows/property/period, 50 API requests, 10 URL inspections/property, 25 seconds and 500 translated events/property. Search data groups page, bounded query, country and device. Queries and URL paths are sanitised/length-limited; OAuth credentials are never logged.

Deterministic thresholds default to 25% and 10 previous clicks. Summary, click change, ranking change, new-query, sitemap and URL Inspection events use period/property/integration-bound external IDs. Dashboard cards show latest clicks, impressions, CTR and impression-weighted position. The supported Search Console APIs do not expose the Core Web Vitals report, so Ghost does not invent it. Index inspection is limited to top returned pages and can partially fail due to quota/permissions.

Troubleshooting: verify the API is enabled, the callback matches exactly, the account owns/has access to the property, and reconnect with `prompt=consent` if Google does not return a refresh token.
# Phase 11: read-only Shopify

Shopify is a first-class connector using the versioned GraphQL Admin API `2026-07` (the REST Admin API is legacy). It requests only `read_orders,read_products,read_inventory,read_discounts,read_locations`. OAuth uses an organisation-bound, HttpOnly, one-use nonce, validates the exact `*.myshopify.com` host and verifies Shopify's callback HMAC before exchanging the code. Omitting `access_mode=per-user` requests an offline token; expiring offline access and refresh-token rotation are supported.

Configure a Shopify app in the Dev Dashboard with `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, and exact allowed redirect `http://localhost:3000/api/integrations/shopify/callback`. Add the five read scopes. No write operation or write scope exists in Ghost.

The connector discovers store name, canonical myshopify domain, currency, IANA timezone and plan. Each store is a separate organisation-scoped integration. Initial order access is bounded to Shopify's standard 60-day order window (90 days requires separately approved `read_all_orders`, which Ghost deliberately does not request); reconciliation overlaps 72 hours. One GraphQL snapshot is capped at 100 orders/products/collections/discounts, 20 API requests, 25 seconds and 500 events. Existing locks, logs, encrypted credentials and duplicate protection are reused.

Events cover created/paid/cancelled/refunded/fulfilled orders, product state, zero/low inventory, collections and discounts. Dashboard/timeline consume normalised events without provider-specific storage. Customer references are salted hashes; only order count and country are retained. Ghost excludes names, emails, phones, addresses, notes, marketing preferences, payment/card data and raw Shopify payloads.

Troubleshooting: confirm the exact callback URL, read scopes, app installation on the development store, API version support, and store domain. Reinstall/reconnect after scope changes.
# Phase 12: Meta Ads reporting

Provider ID `meta_ads` is a read-only connector built on the shared connector SDK. It uses a focused Zod-validated Graph API client, encrypted credentials, organisation-bound OAuth, generic locks/logs/health, isolated translation and universal event insertion. The default Graph/Marketing API is `v25.0`; override only with a validated `META_GRAPH_API_VERSION`.

## Natasha's Meta setup

1. In Meta for Developers create/select a Business app and add Facebook Login for Business/Marketing API.
2. Add the exact valid OAuth redirect `http://localhost:3000/api/integrations/meta-ads/callback`; production generally needs a public HTTPS equivalent.
3. Configure server-only `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` and `META_GRAPH_API_VERSION=v25.0`.
4. Request only `ads_read` and `business_management`. The latter is used only for accessible business/ad-account discovery. No write permission or mutation exists.
5. Developers/app testers can connect while the app is in Development mode. External public users normally require App Review and Advanced Access for these permissions.
6. Add test users with explicit access to development ad accounts; connecting Meta does not grant access to every account.

OAuth state is cryptographically random, HttpOnly, ten-minute, one-use, and bound to user, organisation, provider and return path. Callback exchanges short-lived access for a long-lived user token when supported, encrypts it, discovers identity/permissions/accounts and selects a sole eligible account only.

Initial sync retrieves 90 days. Normal sync reconciles seven days; settings retain revision fingerprints so unchanged rows create no event and changed attributed history creates a deterministic revision. A future scheduler can invoke the same runner for 28-day extended reconciliation. Daily reporting preserves account calendar date, timezone and currency. Spend/cost/value remain decimal strings plus six-place fixed micros; different currencies are never combined.

Hierarchy sync covers campaigns, ad sets and ads without audiences/targeting. Insights cover account and campaign daily reporting with explicit unified `7d_click` and `1d_view` windows. Meta-attributed purchases/leads use documented precedence (`omni_purchase`, pixel purchase, purchase) instead of summing aliases. They must not be described as Shopify orders, Stripe payments or proof of incremental impact.

Allowed breakdowns are `publisher_platform`, `device_platform`, and `country`, one at a time, though the default sync requests none. The client caps ten selected accounts, ten pages, 5,000 rows, 45 seconds and two retry slots. Errors distinguish authentication, permission, rate limit, invalid parameter and service failure. No leads, people, messages, comments, audiences, payment details, raw tokens or unfiltered Graph payloads are stored.

Disconnect uses the generic Owner/Admin action: credentials are erased and history is retained. Managers with `integration.sync` may manually sync; read-only roles may only view.
# Phase 13: LinkedIn (read-only)

LinkedIn is implemented as a normal connector and feeds the universal event engine. It supports capability-aware LinkedIn Advertising and Company Page aggregate reporting, daily reconciliation, deterministic fingerprints, encrypted credentials, organisation permissions, sync locks, integration logs, and child-asset selection. It never posts, changes campaigns, retrieves member lists, or exposes an arbitrary API proxy.

Set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `LINKEDIN_REDIRECT_URI` (locally, exactly `http://localhost:3000/api/integrations/linkedin/callback`). `LINKEDIN_API_VERSION` defaults to `202607`, the July 2026 stable Marketing API version selected from LinkedIn's official versioning documentation. Register the exact callback under the LinkedIn app Auth tab. Add the Sign In with LinkedIn using OpenID Connect product and apply separately for Advertising API and Community Management API access; creating an app alone does not grant Marketing API production access.

Ghost requests exactly `openid profile r_ads r_ads_reporting r_organization_admin r_organization_social`: OpenID identity, advertising structure, advertising reporting, administered-organisation/page analytics, and organisation content analytics respectively. The callback records what LinkedIn actually granted and probes Ads and Company Page capabilities independently. No write scope (`rw_ads`, `w_organization_social`, `rw_organization_admin`) is requested or used. Because LinkedIn consent is all-or-nothing for the requested scopes and scopes depend on approved products, the app may need the relevant LinkedIn product approvals before OAuth succeeds.

After connecting, choose eligible ad accounts and Company Pages under LinkedIn settings, then use the generic **Sync now** action. One eligible asset is selected automatically; multiple assets require explicit selection. Existing generic `integrations.settings` safely holds capability evidence, assets, selections, checkpoints, and fingerprints, so Phase 13 adds no database migration.

To add or update LinkedIn endpoints, keep them in the strict allowlist in `lib/integrations/linkedin/client.ts`, add Zod validation and bounded pagination, return only normalised records from the connector, and translate them in the isolated translator. Preserve aggregate-only privacy and currency separation.
