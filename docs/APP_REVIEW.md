# App reviews and verification

What Microsoft, Meta and LinkedIn need before customers can connect without warnings, and
everything to paste into their forms. Do them in this order: Microsoft (quick), Meta (most
valuable), LinkedIn (slowest).

Requirements change. Check each company's current pages before submitting; links are at the end.

---

## Details used everywhere

| Field | Value |
|---|---|
| App name | Metric Mage |
| Website / app URL | `https://www.metricmage.co.uk` |
| Privacy policy | `https://www.metricmage.co.uk/privacy` |
| Terms of service | `https://www.metricmage.co.uk/terms` |
| Data deletion instructions | `https://www.metricmage.co.uk/data-deletion` |
| Support / contact email | `support@metricmage.co.uk` |
| App icon | `Logo 1024.png` (1024 × 1024) in the project folder |
| Category | Business / productivity |

Short description (most forms ask for one):

> Metric Mage gives small businesses a plain-English update on how they're doing. It reads
> figures from the tools they already use (sales, ads, social media, website traffic and email)
> and points out what changed, why, and what to do about it. It only reads; it never posts,
> sends, or changes anything in connected tools.

**Before submitting anything:** a reviewer needs to sign in. Create a test login on the live
site (for example `review@metricmage.co.uk`), create an organisation in it, and connect the
tools being reviewed using an account the reviewer can see working. Don't use a customer's
data. Give the reviewer the login in the form's "testing instructions" box, never anywhere
public.

---

## 1. Microsoft (Outlook): publisher verification

**Why:** Outlook asks only for `Mail.ReadBasic` (sender, recipients, subject and date; never the
message), `User.Read` (the person's name and email, to label the connection) and
`offline_access` (to keep syncing). These don't need an app review, but without a verified
publisher Microsoft shows "unverified" on the sign-in screen, and many work accounts can't
connect at all because their IT only allows verified apps.

**What you need:**

1. **An email address at metricmage.co.uk** for the Microsoft accounts below (not Gmail or
   Outlook.com). The domain of this email must match the app's publisher domain.
2. **A Microsoft AI Cloud Partner Program account** (free). Sign up at Partner Center with
   that email, and complete its verification (Microsoft checks the business details and email;
   usually a few days at most). Note the **Partner One ID** of the *partner global account*,
   not a "location" ID.
3. **metricmage.co.uk verified in Microsoft Entra** for the tenant that owns the Metric Mage app
   registration: Entra admin centre → **Domain names** → **Add custom domain**, then add the TXT
   record it shows to the domain's DNS. The publisher domain can't be `*.onmicrosoft.com`.
4. **Roles:** your Entra user needs Application Administrator, Cloud Application Administrator
   or Global Administrator; in Partner Center, Admin, Accounts Admin or Global Administrator.

**Then:**

1. Entra admin centre → **App registrations** → Metric Mage → **Branding & properties**.
2. Set **Publisher domain** to `metricmage.co.uk`. Fill in the home page, terms and privacy URLs
   from the table above, and upload the logo.
3. Under **Publisher verification**, click **Add Partner One ID to verify publisher**, enter the
   ID, then **Verify and save**.

A blue "verified" badge then shows on Microsoft's sign-in screen. If it fails, the error usually
says which of the requirements above isn't met.

---

## 2. Meta (Facebook Pages and Meta Ads)

Both connections use the same Meta app (`META_APP_ID`), so one review covers both.

### 2.1 Business verification

Meta Business Suite → **Settings** → **Business info** → **Start verification**. You'll need:

- The business's legal name and address, exactly as on official documents
- A document showing them: Companies House certificate, VAT registration, or a utility bill or
  bank statement in the business's name
- A business phone number or email that Meta can contact, and the website
  `https://www.metricmage.co.uk`

The Meta app must belong to this verified business portfolio (App Dashboard → **App settings →
Basic** → connect it to the business).

### 2.2 App settings (App Dashboard → App settings → Basic)

- **App domains:** `metricmage.co.uk`, `www.metricmage.co.uk`
- **Privacy policy URL, Terms of service URL:** from the table above
- **User data deletion:** choose *Data deletion instructions URL* and enter
  `https://www.metricmage.co.uk/data-deletion`
- **App icon:** `Logo 1024.png`
- **Category:** Business and pages
- **Contact email:** `support@metricmage.co.uk`

Facebook Login → **Settings** → **Valid OAuth redirect URIs** must contain exactly what Vercel
has in `META_SOCIAL_REDIRECT_URI` (or `META_REDIRECT_URI`) and `META_REDIRECT_URI`, normally:

- `https://www.metricmage.co.uk/api/integrations/meta-social/callback`
- `https://www.metricmage.co.uk/api/integrations/meta-ads/callback`

### 2.3 Permissions to request (App Review → Permissions and features → Advanced access)

Paste each answer into "How will your app use this permission?". Each needs its own screen
recording (scripts in 2.4).

**pages_show_list**

> Metric Mage lists the Facebook Pages a person manages so they can choose which Pages their
> business tracks. After connecting, the person sees their Pages on our "Facebook Pages and
> Instagram" settings screen and ticks the ones to include. We only use the list to show those
> choices and to know which Pages to read figures for.

**pages_read_engagement**

> We read engagement for the Pages the person chose (reactions, comments and shares on their
> posts, and follower counts) to show how their Facebook presence is doing over time on their
> Metric Mage dashboard, for example "People reached down 30% this week", and to include it in
> their weekly summary email. We never post, comment or message.

**read_insights**

> We read Page Insights (daily reach, post views, followers and engagement) for the Pages the
> person chose. Metric Mage turns these into plain-English updates on the business owner's
> dashboard and weekly email, and compares them with their other tools (for example, whether
> fewer people saw their posts in the same week their website visits fell). Without Page
> Insights the Facebook figures on their dashboard would be empty.

**business_management**

> Many small businesses own their Pages and ad accounts through a Meta business portfolio
> rather than a personal profile. We use business_management only to read which Pages and ad
> accounts the person's business portfolio contains, so they can choose them in Metric Mage. We
> never change business settings, assets, people or permissions.

**ads_read**

> We read daily results for the ad accounts the person chooses (spend, impressions, clicks,
> and purchases Meta attributes to the ads) to show their advertising alongside their sales and
> website traffic. For example, Metric Mage can tell them "Your Meta ads stopped spending on
> Tuesday; website visits and Google search were normal, so that's the most likely reason orders
> fell". We never create, edit, pause or pay for ads.

**Data handling questions** (answers to Meta's data use checkup / questionnaire):

- *Do you share or sell Platform Data?* No. It's shown only to the organisation that connected
  it, and never sold, used for advertising, or used to train AI.
- *Where is it stored?* In Metric Mage's Supabase database, processed on Vercel. Access tokens
  are encrypted at rest. (Check the Supabase project's region in its settings and add it here.)
- *How long?* Until the person disconnects, deletes the organisation or deletes their account.
  Disconnecting deletes the stored token immediately.
- *Who are your processors?* Vercel (hosting), Supabase (database), Resend (emails), Sentry (error reports, with personal details removed).

### 2.4 Screen recording scripts

Meta wants to see the whole flow from a logged-out start, with the permission being used.
Record at a readable size, in English, without sound or with a short voiceover, 1–3 minutes
each. Use the reviewer test login.

**Recording A: Facebook Pages (covers pages_show_list, pages_read_engagement, read_insights,
business_management)**

1. Start on `https://www.metricmage.co.uk`, click **Sign in**, sign in with the test login.
2. Open **Connections**, find **Facebook Pages and Instagram**, click **Connect**.
3. On Facebook's screens, show the permissions list, pick the business and Page, and continue.
4. Back in Metric Mage, show the settings screen listing the Pages (this is pages_show_list and
   business_management), tick a Page, click **Save**.
5. Go back to **Connections** and click **Sync now** on Facebook Pages, then open **Home** and show the Facebook figures
   (followers, people reached) and the Timeline entries for the Page (read_insights and
   pages_read_engagement).
6. Show **Connections → Disconnect** to finish.

**Recording B: Meta Ads (covers ads_read, business_management)**

1. Signed in as the test login, open **Connections**, find **Meta Ads**, click **Connect**.
2. On Facebook's screens, choose the ad account and continue.
3. In Metric Mage, show the ad account selected on the Meta Ads settings screen.
4. On **Connections**, click **Sync now** on Meta Ads, then show **Home**: the Ad spend figure and the daily Meta Ads entries in
   Latest activity / Timeline.
5. Show **Connections → Disconnect**.

### 2.5 Instagram (only if you want it)

Instagram professional accounts need extra permissions (`instagram_basic`,
`instagram_manage_insights`, `pages_read_user_content`) and the Instagram product added to the
Meta app. Add those in the dashboard, set `META_SOCIAL_INCLUDE_INSTAGRAM=true` in Vercel, and
include them in the review with the same kind of answer as `read_insights`. Leave this out of
the first submission to keep it simple.

---

## 3. LinkedIn (later)

LinkedIn splits this into two programmes, each applied for from the LinkedIn Developer portal
under **Products**:

- **Advertising API** (`r_ads`, `r_ads_reporting`): ad accounts and campaign results.
- **Community Management API** (`r_organization_admin`, `r_organization_social`): Company Page
  followers and post performance.

Points to check when applying:

- The app must be linked to the Metric Mage LinkedIn Company Page, and a Page admin must verify
  that link.
- LinkedIn has required the Community Management API to be the only product on its app. If
  that's still the case, it needs a second LinkedIn app, and the code would need a second set of
  `LINKEDIN_*` settings for Company Pages.
- Both start on a limited development tier; moving to the standard tier needs a further
  application with a screen recording, much like Meta's.

Leave this until customers ask for LinkedIn.

---

## 4. Google (heads-up)

Gmail uses the `gmail.readonly` permission, which Google classes as **restricted**. Before
people outside your test users can connect Gmail, Google requires app verification **and** an
annual independent security assessment (CASA), which has a cost. Metric Mage only reads the
sender, recipients, subject and date, but every Gmail permission that reads messages is
restricted, so switching permission doesn't avoid this. Options: keep Gmail limited to test
users for now, budget for the assessment, or point people to Outlook. The other Google
connections (Analytics, Search Console, Calendar, Business Profile) use sensitive rather than
restricted permissions and need only the standard Google verification.

---

## Links

- Microsoft publisher verification:
  https://learn.microsoft.com/entra/identity-platform/publisher-verification-overview
- Mark an app as publisher verified:
  https://learn.microsoft.com/entra/identity-platform/mark-app-as-publisher-verified
- Troubleshooting publisher verification:
  https://learn.microsoft.com/entra/identity-platform/troubleshoot-publisher-verification
- Meta App Review: https://developers.facebook.com/docs/app-review
- Meta permissions reference: https://developers.facebook.com/docs/permissions
- Meta business verification: https://www.facebook.com/business/help/2058515294227817
- LinkedIn Marketing APIs access: https://learn.microsoft.com/linkedin/marketing/increasing-access
- Google restricted scope verification:
  https://support.google.com/cloud/answer/13464325
