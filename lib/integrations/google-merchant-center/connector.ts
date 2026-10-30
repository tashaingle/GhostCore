import type {IntegrationConnector, IntegrationSyncContext} from "../connector";
import type {NormalisedEventInput} from "@/types/events";
import {MerchantCenterClient, MerchantCenterError} from "./client";
import {MERCHANT_LIMITS} from "./config";
import {
  countAggregates,
  countProducts,
  productState,
  topIssues,
  translateAccountIssue,
  translateDisapproval,
  translatePerformanceDay,
  translateSummary,
} from "./translator";
import type {
  AccountIssue,
  AggregateStatus,
  MerchantCenterSettings,
  MerchantProduct,
  PerformanceDay,
} from "./types";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Sign-in and quota problems stop the whole sync; anything else only skips that part. */
const fatal = (error: unknown) =>
  error instanceof MerchantCenterError &&
  (error.kind === "unauthorized" || error.kind === "rate_limit");

export class MerchantCenterConnector implements IntegrationConnector {
  readonly provider = "google_merchant_center";
  private error?: unknown;
  constructor(
    private client: MerchantCenterClient,
    private settings: MerchantCenterSettings,
    private now: () => Date = () => new Date(),
  ) {}
  connect = async () => ({ok: true});
  // People remove Metric Mage from their Google Account; disconnecting only forgets it here.
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.accounts();
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof MerchantCenterError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  // Merchant Center events are built per account during sync, from several reads together.
  translate = () => null;
  async sync(context: IntegrationSyncContext) {
    const selected = (this.settings.accounts ?? [])
      .filter((account) => account.selected)
      .slice(0, MERCHANT_LIMITS.accounts);
    if (!selected.length)
      throw new MerchantCenterError(
        "permission",
        "Choose a Merchant Center account before syncing.",
      );
    const now = this.now(),
      today = iso(now),
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)),
      start = new Date(end);
    start.setUTCDate(start.getUTCDate() - MERCHANT_LIMITS.performanceDays + 1);
    const ctx = {...context, receivedAt: context.receivedAt ?? now.toISOString()},
      events: NormalisedEventInput[] = [];
    let received = 0,
      filtered = 0,
      failures = 0,
      failedAccounts = 0,
      failure: unknown;
    const attempt = async <T>(read: () => Promise<T>): Promise<T | null> => {
      try {
        return await read();
      } catch (error) {
        if (fatal(error)) throw error;
        failures++;
        failure = error;
        return null;
      }
    };
    for (const account of selected) {
      const aggregates: AggregateStatus[] | null = await attempt(() =>
          this.client.aggregateStatuses(account.accountId),
        ),
        listed = await attempt(() => this.client.products(account.accountId)),
        accountIssues: AccountIssue[] | null = await attempt(() =>
          this.client.accountIssues(account.accountId),
        ),
        // Performance reports need a linked Ads account or free listings; an error here is normal.
        performance: PerformanceDay[] | null = await attempt(() =>
          this.client.performance(account.accountId, iso(start), iso(end)),
        );
      if (!aggregates && !listed && !accountIssues) {
        failedAccounts++;
        continue;
      }
      const products: MerchantProduct[] = listed?.products ?? [];
      received +=
        (aggregates?.length ?? 0) +
        products.length +
        (accountIssues?.length ?? 0) +
        (performance?.length ?? 0);
      const google = aggregates?.length ? countAggregates(aggregates) : null,
        counts = google ?? (listed?.complete || !aggregates ? countProducts(products, now) : null);
      if (counts)
        events.push(
          translateSummary(
            {
              account,
              day: today,
              counts,
              countedFrom: google ? "google" : "products",
              issues: topIssues(aggregates ?? []),
              accountIssues: accountIssues ?? [],
            },
            ctx,
          ),
        );
      let disapprovals = 0;
      for (const product of products) {
        if (productState(product) !== "disapproved") continue;
        const event =
          disapprovals < MERCHANT_LIMITS.disapprovedProductsPerSync
            ? translateDisapproval(product, account, ctx)
            : null;
        if (event) {
          events.push(event);
          disapprovals++;
        } else filtered++;
      }
      for (const issue of accountIssues ?? []) {
        const event = translateAccountIssue(issue, account, ctx);
        if (event) events.push(event);
        else filtered++;
      }
      const byDay = new Map<string, PerformanceDay[]>();
      for (const row of performance ?? []) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
      for (const [day, rows] of byDay) {
        const event = translatePerformanceDay(account, day, rows, ctx, today);
        if (event) events.push(event);
        else filtered++;
      }
    }
    if (failedAccounts === selected.length)
      throw failure instanceof Error
        ? failure
        : new MerchantCenterError(
            "provider",
            "Merchant Center could not be read. Please try again.",
          );
    return {
      received,
      events,
      filtered,
      credentials: this.client.credentialUpdate(),
      settings: {...this.settings, lastSyncAt: now.toISOString(), partialFailures: failures},
    };
  }
}
