# Ghost Core MVP handover

## Completed

Implemented Supabase SSR clients and Next.js 16 proxy session refresh; authentication and callback; transactional organisation onboarding; protected application shell; live overview; event timeline filters/pagination; test integration CRUD; developer event creation and idempotent demo seed; reusable normalisation/ingestion; connector interfaces/manual translator; authenticated APIs; validation, tests, migration, and documentation.

Phase 2 adds the first production connector: GitHub identity linking through Supabase Auth, a dedicated server callback, AES-256-GCM credential storage, account validation, manual sync/disconnect actions, bounded GitHub REST calls, activity/workflow translators, status/error reporting, and tests. Timeline and overview remain provider-agnostic and required no changes.

OAuth initiation was subsequently moved from a server action to a client component. This lets the authenticated browser client own the PKCE verifier cookie and explicitly follow the returned provider URL. The component verifies the exact callback origin, checks session/identity state and the public provider setting, and classifies Supabase errors. The server callback still exclusively handles code exchange, provider tokens, encryption, and database writes.

Phase 3 turns this into a reusable integration platform. A single provider registry drives eleven dashboard cards and declares capabilities and future schedules. The connector SDK standardises connect, disconnect, refresh, sync, health, and translation. GitHub now returns normalised events without inserting them. The shared sync runner owns connector loading, health/auth checks, event insertion, duplicate accounting, status updates, and logging.

Phase 4 implements Google Analytics 4 as the second production connector. It uses direct Google OAuth with HttpOnly state/PKCE cookies and offline access, encrypted refreshable credentials, Admin API property discovery, one-property configuration, aggregate Data API reporting, property-time-zone complete periods, deterministic threshold translation, generic runner insertion/logging, reauthorisation, property changes, and revocation/credential clearing.

## Architecture and security

The active organisation is selected server-side from the authenticated user's first membership. Queries add the organisation predicate even though RLS is the final enforcement boundary. Organisation creation calls an authenticated, tightly scoped `SECURITY DEFINER` function so organisation and owner membership are atomic. No service role or integration credentials are used.

Important areas: `app/app`, `app/actions.ts`, `app/api`, `lib/supabase`, `lib/events`, `lib/integrations`, `lib/organisations`, `types`, `tests`, and `supabase/migrations`.

GitHub-specific areas: `app/github-actions.ts`, `app/auth/github/callback/route.ts`, `lib/integrations/github`, `lib/security/token-crypto.ts`, and the GitHub integration card in `app/app/integrations/page.tsx`.

Platform areas: `lib/integrations/registry.ts`, `connector.ts`, `loader.ts`, `health.ts`, `sync-runner.ts`, `app/integration-actions.ts`, the registry-driven integration dashboard, and `tests/integration-platform.test.ts`.

GA4 areas: `lib/integrations/google-analytics`, the protected connect and callback routes, `app/google-analytics-actions.ts`, the property-selection route, `.env.example`, and `tests/google-analytics.test.ts`. The generic dashboard consumes `connectPath`, `configurationPath`, and registry capabilities; it contains no Google-specific branch.

## Database changes

Apply `202607280001_mvp_support.sql`. It creates the onboarding function, a partial unique index for event idempotency, and explicitly preserves RLS. It does not recreate or drop the existing remote core tables.

Phase 2 adds no migration and uses the existing integration credential and sync-state columns. `types/database.ts` was expanded to represent those existing columns accurately.

Phase 3 adds `202607280002_integration_logs.sql`. It creates a separate RLS-protected operational log with indexes and member-scoped select/insert/update policies. Apply it before using Sync now.

Phase 4 adds no database migration. Existing encrypted credential, expiry, account, status, and `settings` columns safely hold the GA4 configuration. Required environment variables are `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_ANALYTICS_REDIRECT_URI`.

## Verification and remaining manual work

See the final delivery report for exact command results. Because supplied `.env.local` was empty, registration, email confirmation, remote writes, and two-user RLS isolation require manual execution after environment configuration. Add the callback URL in Supabase Auth, apply the migration, then follow the two-user isolation procedure in README.

GitHub manual verification additionally requires enabling the GitHub provider and manual identity linking in Supabase, registering the Supabase provider callback in the GitHub OAuth App, adding Ghost's `/auth/github/callback` to the Supabase redirect allow list, and configuring `GITHUB_TOKEN_ENCRYPTION_KEY`. Verify connect, sync, repeat sync (zero duplicates), timeline/overview changes, disconnect, and reconnect.

Recommended next phase: add a background worker that evaluates registry schedules and invokes the same runner, then implement webhook dispatch and the second production connector. Move GitHub from the broad classic OAuth `repo` scope to a fine-grained GitHub App.

Recommended next phase after GA4: schedule registry-driven incremental sync, improve operational health codes beyond the existing status/error message pair, and add a third connector to validate shared OAuth abstractions without weakening provider-specific security.
# Phase 5 handover — Intelligence Engine

Phase 5 adds a deterministic intelligence layer on top of the existing universal event model. It does not alter connector responsibilities: GitHub and GA4 still emit normalised events, and `lib/intelligence/runner.ts` alone persists insight candidates.

## Components

- `supabase/migrations/202607280003_insights.sql`: RLS insight persistence, lifecycle checks, evidence IDs, deterministic uniqueness.
- `lib/intelligence/rules`: pure, modular analytics, GitHub, and cross-provider rules.
- `lib/intelligence/runner.ts`: rolling-window evaluation, confidence normalization, duplicate-safe update/insert, and recovery resolution.
- `app/api/insights`: authenticated list/detail/lifecycle endpoints.
- `app/app/insights/[id]`: explanation, recommendation, confidence, evidence, and lifecycle controls.
- Overview: insight counts, confidence, top recommendation, today’s insights, and manual runner.
- Timeline: provider-agnostic Events / Insights / Everything view.

Integration sync invokes intelligence after event insertion. The manual Overview action is useful after importing historical data or changing rule thresholds. There is no new secret or environment variable.

## Deployment/manual steps

1. Apply all Supabase migrations through `202607280003_insights.sql`.
2. Deploy the application normally; existing GitHub/GA4 OAuth configuration is unchanged.
3. Sync an integration or click **Run intelligence**.
4. Confirm organisation members can see only their organisation’s insights and supporting evidence.

## Extension contract

New rules must be pure and return candidates only. Use normalised event types, central thresholds, stable fingerprints, and evidence event IDs. Do not insert insights from connectors. Lifecycle states are `active`, `acknowledged`, `dismissed`, and `resolved`; recovery rules can specify rule IDs to resolve.
# Phase 6 handover — Multi-Organisation Workspace

Phase 6 turns the existing organisation model into a server-resolved multi-tenant workspace system without changing connectors, events or intelligence architecture.

## Architecture

- `lib/organisations/active.ts`: validates cookie/profile preference against current active memberships and safely falls back.
- `lib/organisations/api-context.ts`: equivalent non-redirecting context for APIs.
- `lib/auth/permissions.ts`: documented five-role capability matrix.
- `app/organisation-actions.ts`: workspace switching/creation/settings, invitations, acceptance and team management.
- `organisation_invitations`: hashed tokens, roles, lifecycle and seven-day expiry.
- Sidebar: logo/name, persistent switcher, creation, Team and Settings links.

All provider credentials and generated records remain attached to `organisation_id`. GitHub OAuth now uses the active workspace after callback. GA4 already uses the shared active context. Intelligence loads and writes only the active organisation.

## Invitation delivery

Supabase Auth `signInWithOtp` sends the invitation email. Configure the project’s SMTP/email templates and allow `${NEXT_PUBLIC_SITE_URL}/auth/callback` plus the application origin in Supabase redirect URLs. The callback permits only relative `next` paths to prevent open redirects. Resend rotates the secret; cancel invalidates it. Only hashes are stored.

## Manual deployment and verification

1. Apply migrations through `202607280004_multi_organisation.sql`.
2. Confirm Supabase Auth email delivery and redirect URLs.
3. Create two workspaces and switch/refresh/sign out/sign in.
4. Connect GitHub in one and GA4 in the other; confirm integrations, events, logs and insights remain separate.
5. Invite a second account, accept it from email, test each role and the sole-owner safeguard.

No new environment variables were introduced.
# Phase 7 handover — Gmail

Gmail uses the existing registry → connector → sync runner → universal events path. OAuth routes are `/api/integrations/gmail/connect` and `/api/integrations/gmail/callback`; mailbox settings are at `/app/integrations/gmail/settings`. Credentials remain encrypted in `integrations`, while safe mailbox metadata and the history cursor live in the existing JSON settings.

Apply `202607280005_integration_sync_lock.sql`. It adds a reusable expiring integration lock and last-attempt timestamp. No Gmail message table was added. The connector uses a seven-day/250-message initial bound, five-page cap, Gmail history increments with safe fallback, per-message failure tolerance, automatic token refresh, Spam/Trash exclusion and metadata-only retrieval.

Required scope: `https://www.googleapis.com/auth/gmail.readonly` plus `openid email`. Required configuration: existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and optional `GMAIL_REDIRECT_URI`. Configure the Gmail API, consent scope/test users, callback URI and any Workspace admin approval before live testing.

Manual testing remains required with real Google accounts: connect/sync twice, receive/send, verify incremental behavior and duplicates, test two mailboxes and two organisations, disconnect/reconnect, and inspect RLS/log isolation. No sending, drafts, modification, bodies, attachment downloads or AI interpretation are implemented.
# Phase 8 handover — Google Calendar

Calendar uses `lib/integrations/google-calendar` and the existing provider-independent sync lock; no migration or calendar mirror table is added. Integration JSON holds safe discovered calendars, selections, per-calendar sync tokens and a bounded relevant-state fingerprint map. Separate integration records support multiple accounts and preserve organisation isolation.

Initial sync is past 30/upcoming 90 days; incremental sync uses per-calendar tokens with 410 fallback. Limits are 50 discovered, 20 selected, five pages and 1,000 events per calendar. Cancelled events are preserved as cancellation events; recurring instances use actual instance IDs; date-only values remain all-day metadata. Apply all existing migrations through Phase 7, configure `GOOGLE_CALENDAR_REDIRECT_URI`, enable Calendar API/read-only scopes, and complete the real-account manual test checklist from the Phase 8 brief.
# Phase 9 — Stripe integration

Stripe now uses the existing registry, connector SDK, sync runner, locks, encrypted credential fields, health states, logs, universal events, organisation resolver, and permissions. There is no parallel financial data store.

- OAuth: `/api/integrations/stripe/connect` → Stripe Connect Standard OAuth (`read_only`) → `/api/integrations/stripe/callback`. State is cryptographically random, hashed in an HttpOnly 10-minute cookie, organisation-bound, consumed once, and membership/role are rechecked.
- Credentials: platform and webhook secrets are server-only. Returned access/refresh values (when Stripe returns them) use the existing AES-GCM encryption. Current Stripe guidance deprecates connected access tokens in favour of the platform key plus `Stripe-Account`; sync follows that model.
- Sync: first 30 days, then a 72-hour overlap, maximum 100/page, 10 pages, 1,000 events, 25 seconds. State advances only after connector processing succeeds. Truncation remains visible in settings/log metadata.
- Webhook: `/api/webhooks/stripe` reads the raw body, enforces 256 KiB, verifies `Stripe-Signature`, resolves the active integration by verified account and mode, records a unique event receipt, and writes the privacy-limited normalised event. Duplicate delivery and reconciliation overlap are harmless.
- Privacy: raw payload storage is reduced to event/type/object IDs. Provider metadata, customer email/name/address, descriptions, payment method, card, bank and tax data are excluded. Customer references are salted one-way hashes.
- Mapping: PaymentIntent is canonical for payment lifecycle. Refund, Checkout, invoice, subscription, dispute and payout mappings are deterministic. No revenue prediction, cross-currency sum, or Stripe write method exists.

Manual steps: apply migration `202607280006_stripe_integration.sql`; provide the five server-only environment values from `.env.example`; enable Connect OAuth for existing Standard accounts; register the exact callback URL; configure a connected-account webhook with only `STRIPE_SUPPORTED_EVENTS`; test in Stripe test mode and verify account/mode labels. A production Connect platform may require Stripe approval/configuration before live OAuth is available.

Remaining manual validation requires real Stripe/Supabase credentials: OAuth consent, two-account isolation, representative Connect webhook delivery, disconnect/reconnect, test/live mapping, and production HTTPS redirect/webhook configuration.
# Phase 10 — Search Console handover

New provider `google_search_console` implements the existing connector SDK. Its server-only client handles refresh, 15-second request timeouts, safe 401/403/429/provider errors, site discovery, Search Analytics, sitemaps and bounded URL Inspection. The translator inserts privacy-limited normalised events only; it does not insert directly.

OAuth routes live under `/api/integrations/google-search-console`. State, PKCE verifier and active organisation are HttpOnly, SameSite=Lax, 10-minute cookies and are consumed at callback. The callback revalidates the authenticated member and `integration.manage`, identifies the Google account through OIDC, encrypts tokens, and preserves selections when reconnecting the same account.

No migration was required: safe property metadata, thresholds and cursors fit the existing `integrations.settings`; events/logs and RLS remain organisation-scoped. API routes expose safe property/settings/sync/disconnect operations with existing permissions.

Manual validation remains: real Google consent, Domain and URL-prefix discovery, multiple account/property selection, Search Analytics availability delay, URL Inspection quota/ownership, sitemap variations, duplicate sync, token revocation, and cross-organisation switching. Apply existing migrations, enable Google Search Console API, configure the consent scope and exact local/production callback URLs.
# Phase 11 — Shopify handover

`shopify` implements the shared connector SDK and loader. Server-only client construction targets GraphQL Admin API `2026-07`, uses `X-Shopify-Access-Token`, refreshes expiring offline tokens, caps requests/time, and categorises authorization, permission, rate-limit, provider and timeout failures. Translation is isolated and the generic sync runner performs insertion/logging/locking.

OAuth routes: `/api/integrations/shopify/connect` and `/callback`; safe settings, sync and disconnect routes are also present. Owners/Admins install/configure/disconnect, roles with `integration.sync` can manually sync, and read-only roles see existing events. Disconnect removes encrypted credentials but preserves historical events.

No migration was required. Store metadata, thresholds and bounded fingerprints use `integrations.settings`; universal events, integration logs and existing RLS remain organisation-scoped.

Manual work: create/configure the Shopify app, set the exact local and production callbacks, add only the five documented read scopes, install on a development store, test expiring offline token refresh, multiple-store isolation, orders/refunds/fulfilment/inventory/products/collections/discounts, duplicate sync, revocation and reconnect. Shopify's default Orders API access is 60 days; a 90-day import requires approval plus `read_all_orders` and is intentionally not enabled.
# Phase 12 — Meta Ads handover

Added registry entry, typed client, OAuth, connector, translator, metrics/action normaliser, account-selection UI, reporting dashboard and tests under the existing architecture. No database migration was necessary: selected child accounts, safe token metadata and checkpoints fit bounded `integrations.settings`; existing events/logs/RLS provide organisation isolation.

Environment: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_GRAPH_API_VERSION`. Default/version tested: `v25.0`. Permissions: `ads_read,business_management`; no advertising write permission/API is exposed.

Manual validation remains with real Meta credentials: Development-mode tester OAuth, App Review/Advanced Access, multi-identity/account discovery, disabled accounts, permission removal, long-lived token expiry/revocation, paginated hierarchy/Insights, API usage headers/rate limits, attribution revisions, multi-currency dashboard filtering, organisation switching, reconnect and disconnect. Confirm v25.0 remains supported in Meta's Versioning page before production deployment.

No security/RLS/smoke scripts exist in `package.json`; do not claim those separate scripts ran. Security invariants are covered by unit/regression tests plus existing RLS migrations, but live Supabase RLS and authenticated browser smoke tests remain manual.
# Phase 13 handover — LinkedIn connector

LinkedIn is now a production-oriented, server-only, read-only connector within the existing integration platform. OAuth state is bound to user, organisation, provider, return path, and creation time in a short-lived HttpOnly SameSite cookie; callback state is compared safely and consumed once. Tokens are exchanged server-side and encrypted with the existing credential system. The stable member `sub` is the provider identity key.

The central client uses the versioned `/rest` API, `Linkedin-Version: 202607` by default, Rest.li 2.0, bearer headers, an endpoint allowlist, Zod response validation, start/count pagination, timeouts, bounded retries, correlation IDs, and safe typed errors. URN helpers canonicalise numeric IDs and prevent duplicated prefixes or `%25` double encoding.

Capability discovery records scope plus endpoint-probe evidence independently for advertising account discovery/reporting and organisation administration/page/content analytics. Partial approval or an empty asset list is not presented as full access. Sync processes selected assets independently and records safe partial failures. Events are aggregate and deterministic; revisions use source fingerprints. No member, follower, visitor, reactor, commenter, lead-form, targeting, billing, or write data is collected.

Environment:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REDIRECT_URI` — exact local value `http://localhost:3000/api/integrations/linkedin/callback`
- `LINKEDIN_API_VERSION` — optional `YYYYMM`, default `202607`

LinkedIn dashboard work still required outside Ghost:

1. Create/select the LinkedIn developer app and register the exact redirect URI.
2. Enable Sign In with LinkedIn using OpenID Connect.
3. Apply for and obtain Advertising API approval for `r_ads` and `r_ads_reporting`.
4. Apply for and obtain Community Management API approval for `r_organization_admin` and `r_organization_social`.
5. Ensure the authorising member has the required ad-account and Page roles.
6. Connect in a credentialed environment and confirm the recorded granted scopes and capability probes. No live scopes were granted during repository-only validation.

No Phase 13 migration is required: generic integration settings, logs, locks, universal events, encrypted credentials, organisation filters, permissions, and RLS remain in use.
# Phase 14 handover — Manual data and CSV import

Phase 14 adds the first-party `manual` connector without credentials or OAuth. A new migration creates organisation-scoped manual records, immutable revisions, custom-field definitions/values, safe attachment references, CSV imports and remembered mappings. Each table has RLS, foreign keys, indexes and role-aware write policies. Records soft-archive; no default destructive delete exists.

The pure CSV engine handles UTF-8 text, RFC-style quoted fields, escaped quotes, CRLF/LF, width validation, preview limits, column mapping, typed row validation and intra-file/database duplicate fingerprints. Valid rows proceed independently. Import history and the generic integration log store deterministic counts and bounded error reports.

The authenticated API surface is:

- `GET/POST /api/integrations/manual/records`
- `PATCH /api/integrations/manual/records/[id]`
- `POST /api/integrations/manual/records/[id]/archive`
- `POST /api/integrations/manual/csv/preview`
- `POST /api/integrations/manual/csv/import`
- `GET/POST /api/integrations/manual/custom-fields`
- `GET /api/integrations/manual/templates/[name]`

Manual records translate into revision-specific universal events with `source=manual`. Event payloads contain safe structured evidence metadata and attachment counts, never file bodies or public storage URLs.

Deployment requires `supabase db push` (or applying `202607290007_manual_data.sql`). No new environment variables are required. A private object-storage upload UI is intentionally not part of this phase; API inputs accept validated references only after the application has placed a permitted file in private storage. Live RLS and browser smoke tests require the target Supabase project, authenticated users for each role and the migration applied.
