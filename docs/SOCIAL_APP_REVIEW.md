# Meta Social — setup & App Review (no TikTok)

Ghost imports **organic Facebook Page + Instagram professional** metrics via the **Meta Social**
connector (`meta_social`). TikTok is **not** in the product.

Paid ads remain a separate connector: **Meta Ads** (`meta_ads`).

---

## Public legal URLs

| Document | URL |
|----------|-----|
| Privacy Policy | `https://ghost-core-two.vercel.app/privacy` |
| Terms of Service | `https://ghost-core-two.vercel.app/terms` |
| App homepage | `https://ghost-core-two.vercel.app` |

---

## Why Meta asks for all of this

Connecting “your socials” in Ghost still goes through **Meta’s APIs**. Facebook and Instagram do
not let arbitrary websites pull Page/IG insights with only a username/password paste.

So Ghost is a **Meta developer app** that:

1. Asks the user (you) to log in with Facebook  
2. Requests permission to read Pages / Instagram insights  
3. Stores an encrypted token and syncs aggregate metrics  

Meta’s rules:

| Mode | Who can connect | What Meta requires |
|------|-----------------|--------------------|
| **Development** | App admins, developers, testers only | Redirect URI, privacy URL, app setup. **No** full App Review for your own testing. |
| **Live / Advanced Access** | Any Facebook user | App Review, often Business Verification, screencast, Advanced Access per permission |

If **only you** use Ghost and you add your Facebook user as an **app admin/tester**, you can often
skip public App Review and still connect **your** Pages/IG. Advanced Access is for **other
customers** (or any non-role user).

This is Meta platform policy, not Ghost inventing extra bureaucracy.

---

## Redirect URI

| Environment | URI |
|-------------|-----|
| Local | `http://localhost:3000/api/integrations/meta-social/callback` |
| Production | `https://ghost-core-two.vercel.app/api/integrations/meta-social/callback` |

Env:

```env
META_APP_ID=
META_APP_SECRET=
META_SOCIAL_REDIRECT_URI=https://ghost-core-two.vercel.app/api/integrations/meta-social/callback
```

---

## Permissions (code)

- `pages_show_list`
- `pages_read_engagement`
- `pages_read_user_content`
- `instagram_basic`
- `instagram_manage_insights`
- `business_management`

Read-only; no publish / ads write.

---

## Fast path: test with your own account (recommended first)

1. Meta app → **Roles** → add your Facebook user as **Administrator** or **Developer**  
2. Keep app in **Development** mode  
3. Deploy Ghost + Meta env vars  
4. Ghost → Integrations → **Connect Meta Social** (logged into that Facebook user)  
5. Select Page + Instagram → Sync → Timeline  

No URL ownership video for TikTok. Meta may still want Privacy Policy URL in App settings → Basic.

---

## Later: real customers (Advanced Access)

Only when people who are **not** app roles need to connect:

1. App Review → Permissions and Features  
2. Request advanced access per permission  
3. Screencast: connect → select assets → sync → timeline  
4. Business verification if Meta requires it  

---

## In-app paths

| Action | Path |
|--------|------|
| Connect | `/api/integrations/meta-social/connect` |
| Settings | `/app/integrations/meta-social/settings` |

```bash
npm test -- tests/meta-social.test.ts tests/integration-platform.test.ts
```
