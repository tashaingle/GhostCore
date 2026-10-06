import {metaAccountDays} from "../../windows";
import {returnDeclineRule} from "./return-decline";

export const metaReturnDeclineRule = returnDeclineRule({
  id: "advertising.meta_return_decline",
  name: "Meta Ads return falling",
  provider: "meta_ads",
  label: "Meta Ads",
  valueLabel: "purchase value",
  attributed: "Meta-attributed",
  days: metaAccountDays,
  caveat: "These are Meta's own attributed figures, not confirmed sales.",
  recommendation:
    "Compare with actual orders in your shop, then review recent campaign, audience or creative changes and check that the Meta pixel and Conversions API are still firing.",
});
