import type {IntelligenceRule} from "../types";
import {analyticsRecoveredRule} from "./analytics/analytics-recovered";
import {trackingInactiveRule} from "./analytics/tracking-inactive";
import {metaReturnDeclineRule} from "./advertising/meta-return-decline";
import {shopifyOrderDeclineRule} from "./commerce/shopify-order-decline";
import {shopifyRefundRateRule} from "./commerce/shopify-refund-rate";
import {adSpendUpOrdersDownRule} from "./cross-provider/ad-spend-up-orders-down";
import {deploymentTrafficDeclineRule} from "./cross-provider/deployment-traffic-decline";
import {failedDeploymentTrafficDeclineRule} from "./cross-provider/failed-deployment-traffic-decline";
import {trafficDeclineStableConversionsRule} from "./cross-provider/traffic-decline-stable-conversions";
import {repeatedWorkflowFailuresRule} from "./github/repeated-workflow-failures";
import {stripeFailureRateRule} from "./payments/stripe-failure-rate";
import {stripeDisputeRule, stripePayoutFailedRule} from "./payments/stripe-money-at-risk";
import {stripeRevenueDeclineRule} from "./payments/stripe-revenue-decline";
export const intelligenceRules: IntelligenceRule[] = [
  trackingInactiveRule,
  failedDeploymentTrafficDeclineRule,
  deploymentTrafficDeclineRule,
  trafficDeclineStableConversionsRule,
  repeatedWorkflowFailuresRule,
  analyticsRecoveredRule,
  shopifyOrderDeclineRule,
  shopifyRefundRateRule,
  stripeFailureRateRule,
  stripeRevenueDeclineRule,
  stripeDisputeRule,
  stripePayoutFailedRule,
  metaReturnDeclineRule,
  adSpendUpOrdersDownRule,
].sort((a, b) => a.priority - b.priority);
export {
  analyticsRecoveredRule,
  trackingInactiveRule,
  deploymentTrafficDeclineRule,
  failedDeploymentTrafficDeclineRule,
  trafficDeclineStableConversionsRule,
  repeatedWorkflowFailuresRule,
  shopifyOrderDeclineRule,
  shopifyRefundRateRule,
  stripeFailureRateRule,
  stripeRevenueDeclineRule,
  stripeDisputeRule,
  stripePayoutFailedRule,
  metaReturnDeclineRule,
  adSpendUpOrdersDownRule,
};
