import {createHash} from "node:crypto";
import type {TranslationContext} from "../connector";
import type {NormalisedEventInput} from "@/types/events";
import type {
  AccountIssue,
  AggregateStatus,
  ItemIssue,
  MerchantAccount,
  MerchantProduct,
  PerformanceDay,
} from "./types";

const SOURCE = "google_merchant_center";
const DAY_MS = 86_400_000;

const clean = (value: string, max: number) =>
  value
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);
const int = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** Google's issue codes and attributes, matched in order, with what they mean in plain English. */
const REASONS: [RegExp, string][] = [
  [
    /image/,
    "Google can't use the product image. It may be missing, too small, or have text or a watermark on it.",
  ],
  [
    /landing.?page|link|url|crawl|unreachable/,
    "Google couldn't open the product page on your website.",
  ],
  [/price|sale/, "The price on your website doesn't match the price in your product feed."],
  [/availability|stock/, "The stock level on your website doesn't match your product feed."],
  [
    /gtin|mpn|identifier|brand|barcode/,
    "The barcode (GTIN), brand or part number is missing or wrong.",
  ],
  [
    /size|colou?r|gender|age.?group|apparel/,
    "Clothing details are missing: size, colour, gender or age group.",
  ],
  [/shipping|delivery/, "Shipping costs or delivery times are missing for this product."],
  [/tax/, "Tax settings are missing for this product."],
  [
    /polic|prohibit|restrict|adult|counterfeit|trademark|unsafe/,
    "The product breaks one of Google's Shopping rules.",
  ],
  [/expir/, "The product is about to drop out of your feed. Send the feed again to keep it live."],
  [/title|description|text|capital|promotional/, "The product title or description has a problem."],
];

/**
 * What an issue means, in plain English. Only Google's code and attribute are matched: free text
 * such as "brand new" would match the wrong reason. Google's own wording is the fallback.
 */
export function plainReason(issue: ItemIssue) {
  const code = `${issue.code ?? ""} ${issue.attribute ?? ""}`.toLowerCase();
  for (const [pattern, reason] of REASONS) if (pattern.test(code)) return reason;
  const fallback = clean(issue.description ?? issue.detail ?? "", 160);
  return fallback
    ? `${fallback}.`.replace(/\.\.$/, ".")
    : "Google flagged a problem with this product.";
}

export type ProductState = "approved" | "disapproved" | "pending";

export function productState(product: MerchantProduct): ProductState {
  const destinations = product.productStatus?.destinationStatuses ?? [],
    issues = product.productStatus?.itemLevelIssues ?? [];
  if (destinations.some((d) => d.approvedCountries?.length)) return "approved";
  if (destinations.some((d) => d.disapprovedCountries?.length)) return "disapproved";
  if (destinations.some((d) => d.pendingCountries?.length)) return "pending";
  return issues.some((i) => i.severity === "DISAPPROVED") ? "disapproved" : "pending";
}

export type ProductCounts = {
  approved: number;
  disapproved: number;
  pending: number;
  expiring: number;
  total: number;
};

/** Counts each product once, whatever countries and destinations it is listed in. */
export function countProducts(products: MerchantProduct[], now: Date): ProductCounts {
  const counts = {approved: 0, disapproved: 0, pending: 0, expiring: 0, total: products.length};
  for (const product of products) {
    counts[productState(product)]++;
    const expires = Date.parse(product.productStatus?.googleExpirationDate ?? "");
    if (Number.isFinite(expires) && expires - now.getTime() <= 7 * DAY_MS) counts.expiring++;
  }
  return counts;
}

/**
 * Google's own counts, from the market (reporting context and country) with the most products.
 * Adding markets together would count a product once per country.
 */
export function countAggregates(rows: AggregateStatus[]):
  | (ProductCounts & {
      reportingContext: string | null;
      country: string | null;
    })
  | null {
  const counted = rows.map((row) => {
    const approved = int(row.stats?.activeCount),
      pending = int(row.stats?.pendingCount),
      disapproved = int(row.stats?.disapprovedCount),
      expiring = int(row.stats?.expiringCount);
    return {
      approved,
      pending,
      disapproved,
      expiring,
      total: approved + pending + disapproved,
      reportingContext: row.reportingContext ?? null,
      country: row.country ?? null,
    };
  });
  return counted.sort((a, b) => b.total - a.total)[0] ?? null;
}

/** The issues affecting the most products, across every market, worded plainly. */
export function topIssues(rows: AggregateStatus[], limit = 5) {
  const byCode = new Map<string, {reason: string; products: number; disapproves: boolean}>();
  for (const row of rows)
    for (const issue of row.itemLevelIssues ?? []) {
      if (issue.severity === "NOT_IMPACTED") continue;
      const key = issue.code ?? issue.description ?? "",
        found = byCode.get(key),
        products = int(issue.productCount);
      byCode.set(key, {
        reason: plainReason(issue),
        products: Math.max(found?.products ?? 0, products),
        disapproves: Boolean(found?.disapproves) || issue.severity === "DISAPPROVED",
      });
    }
  return [...byCode.values()].sort((a, b) => b.products - a.products).slice(0, limit);
}

export const isSuspension = (issue: AccountIssue) =>
  /suspend|misrepresent/i.test(`${issue.title ?? ""} ${issue.detail ?? ""}`);

const issueSeverity = (issue: AccountIssue): NormalisedEventInput["severity"] =>
  issue.severity === "CRITICAL" || isSuspension(issue)
    ? "critical"
    : issue.severity === "ERROR"
      ? "warning"
      : "info";

export function translateSummary(
  input: {
    account: MerchantAccount;
    day: string;
    counts: ProductCounts & {reportingContext?: string | null; country?: string | null};
    countedFrom: "google" | "products";
    issues: ReturnType<typeof topIssues>;
    accountIssues: AccountIssue[];
  },
  context: TranslationContext,
): NormalisedEventInput {
  const {account, counts} = input,
    name = clean(account.name, 80),
    share = counts.total ? counts.disapproved / counts.total : 0,
    suspended = input.accountIssues.some(isSuspension),
    serious = input.accountIssues.filter((i) => issueSeverity(i) === "critical"),
    parts = [
      `${counts.approved.toLocaleString("en-GB")} approved`,
      `${counts.disapproved.toLocaleString("en-GB")} disapproved`,
      ...(counts.pending ? [`${counts.pending.toLocaleString("en-GB")} pending`] : []),
    ];
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: SOURCE,
    category: "sales",
    eventType: "google_merchant_center.products.daily_summary",
    title: `Merchant Center · ${name} · ${parts.join(", ")}`.slice(0, 200),
    description: suspended
      ? "Google has flagged this account for suspension. Check Merchant Center now."
      : input.issues[0]
        ? `Most common problem: ${input.issues[0].reason}`
        : null,
    severity: suspended || serious.length ? "critical" : share >= 0.1 ? "warning" : "info",
    occurredAt: `${input.day}T12:00:00.000Z`,
    externalId: `${SOURCE}:${account.accountId}:summary:${input.day}`,
    rawPayload: {reportingDate: input.day},
    metadata: {
      sourceAccountId: account.accountId,
      sourceEntityType: "account",
      sourceEntityName: name,
      reportingDate: input.day,
      countedFrom: input.countedFrom,
      reportingContext: counts.reportingContext ?? null,
      country: counts.country ?? null,
      approved: counts.approved,
      disapproved: counts.disapproved,
      pending: counts.pending,
      expiring: counts.expiring,
      total: counts.total,
      disapprovedPercent: Math.round(share * 1000) / 10,
      topIssues: input.issues,
      // The account's open problems right now, so insights can clear once they are fixed.
      accountIssues: input.accountIssues.slice(0, 20).map((issue) => ({
        id: hash(issue.name ?? issue.title ?? ""),
        title: clean(issue.title ?? "Account issue", 160),
        severity: issueSeverity(issue),
        suspension: isSuspension(issue),
      })),
    },
  };
}

export function translateDisapproval(
  product: MerchantProduct,
  account: MerchantAccount,
  context: TranslationContext,
): NormalisedEventInput | null {
  const id = product.name ?? product.offerId ?? "",
    blocking = (product.productStatus?.itemLevelIssues ?? []).filter(
      (issue) => issue.severity === "DISAPPROVED",
    );
  if (!id || !blocking.length) return null;
  const title = clean(
      product.productAttributes?.title ??
        product.attributes?.title ??
        product.offerId ??
        "A product",
      90,
    ),
    reasons = [...new Set(blocking.map(plainReason))],
    codes = blocking.map((issue) => issue.code ?? issue.description ?? "").sort();
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: SOURCE,
    category: "sales",
    eventType: "google_merchant_center.product.disapproved",
    title: `Merchant Center · “${title}” disapproved`.slice(0, 200),
    description: reasons.join(" ").slice(0, 500),
    severity: "warning",
    occurredAt: context.receivedAt,
    // The same product with the same problems is recorded once; a new problem is new news.
    externalId: `${SOURCE}:${account.accountId}:product:${hash(id)}:${hash(codes.join("|"))}`,
    rawPayload: {},
    metadata: {
      sourceAccountId: account.accountId,
      sourceEntityType: "product",
      sourceEntityName: title,
      offerId: product.offerId ? clean(product.offerId, 120) : null,
      reasons,
      issueCodes: codes.map((code) => clean(code, 80)).slice(0, 10),
      countries: [
        ...new Set(
          (product.productStatus?.destinationStatuses ?? []).flatMap(
            (d) => d.disapprovedCountries ?? [],
          ),
        ),
      ].slice(0, 20),
    },
  };
}

export function translateAccountIssue(
  issue: AccountIssue,
  account: MerchantAccount,
  context: TranslationContext,
): NormalisedEventInput | null {
  const title = clean(issue.title ?? "", 140);
  if (!title) return null;
  const severity = issueSeverity(issue),
    suspension = isSuspension(issue);
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: SOURCE,
    category: "sales",
    eventType: suspension
      ? "google_merchant_center.account.suspension_warning"
      : "google_merchant_center.account.issue",
    title: `Merchant Center · ${clean(account.name, 60)} · ${title}`.slice(0, 200),
    description: issue.detail ? clean(issue.detail, 500) : null,
    severity,
    occurredAt: context.receivedAt,
    externalId: `${SOURCE}:${account.accountId}:account_issue:${hash(issue.name ?? title)}:${issue.severity ?? "UNKNOWN"}`,
    rawPayload: {},
    metadata: {
      sourceAccountId: account.accountId,
      sourceEntityType: "account",
      sourceEntityName: clean(account.name, 80),
      issueSeverity: issue.severity ?? null,
      suspension,
      documentationUri: issue.documentationUri?.startsWith("https://")
        ? issue.documentationUri.slice(0, 300)
        : null,
      regions: [
        ...new Set(
          (issue.impactedDestinations ?? []).flatMap((d) =>
            (d.impacts ?? []).map((i) => i.regionCode ?? "").filter(Boolean),
          ),
        ),
      ].slice(0, 20),
    },
  };
}

export function translatePerformanceDay(
  account: MerchantAccount,
  day: string,
  rows: PerformanceDay[],
  context: TranslationContext,
  revision: string,
): NormalisedEventInput | null {
  const pick = (method: PerformanceDay["marketingMethod"]) =>
      rows.filter((r) => r.marketingMethod === method),
    sum = (items: PerformanceDay[], key: "clicks" | "impressions") =>
      items.reduce((t, r) => t + r[key], 0),
    free = pick("ORGANIC"),
    ads = pick("ADS"),
    clicks = sum(rows, "clicks"),
    impressions = sum(rows, "impressions");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || impressions === 0) return null;
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: SOURCE,
    category: "marketing",
    eventType: "google_merchant_center.performance.daily_recorded",
    title: `Merchant Center · ${clean(account.name, 80)} · ${count(clicks, "click", "clicks")} from ${count(impressions, "view", "views")}`,
    description: null,
    severity: "info",
    occurredAt: `${day}T12:00:00.000Z`,
    // Google keeps updating recent days, so each sync day records a new revision.
    externalId: `${SOURCE}:${account.accountId}:performance:${day}:${revision}`,
    rawPayload: {reportingDate: day, revision},
    metadata: {
      sourceAccountId: account.accountId,
      sourceEntityType: "account",
      sourceEntityName: clean(account.name, 80),
      reportingDate: day,
      metrics: {
        clicks,
        impressions,
        freeListingClicks: sum(free, "clicks"),
        freeListingImpressions: sum(free, "impressions"),
        adClicks: sum(ads, "clicks"),
        adImpressions: sum(ads, "impressions"),
      },
    },
  };
}
