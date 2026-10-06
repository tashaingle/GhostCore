import {googleAdsAccountDays} from "../../windows";
import {returnDeclineRule} from "./return-decline";

export const googleAdsReturnDeclineRule = returnDeclineRule({
  id: "advertising.google_ads_return_decline",
  name: "Google Ads return falling",
  provider: "google_ads",
  label: "Google Ads",
  valueLabel: "conversion value",
  attributed: "Google-attributed",
  days: googleAdsAccountDays,
  caveat:
    "These are Google's own conversion figures, which can still change for a few days, not confirmed sales.",
  recommendation:
    "Compare with actual sales, then check which campaigns changed (bids, budgets, keywords or ads) and that conversion tracking is still recording in Google Ads.",
});
