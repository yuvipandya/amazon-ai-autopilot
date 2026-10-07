export type SearchTermClassification =
  | "WINNER"
  | "UNDERFUNDED_WINNER"
  | "WASTE"
  | "HIGH_SPEND_ZERO_ORDER"
  | "NEUTRAL";

export interface SearchTermMetrics {
  impressions: number;
  clicks: number;
  orders: number;
  spend: number;
  sales: number;
  acos: number;
}

export interface SearchTermAnalysis extends SearchTermMetrics {
  classification: SearchTermClassification;
  conversionRate: number;
  ctr: number;
  roas: number;
}

export function classifySearchTerm(
  metrics: SearchTermMetrics
): SearchTermAnalysis {
  const impressions = Math.max(0, metrics.impressions);
  const clicks = Math.max(0, metrics.clicks);
  const orders = Math.max(0, metrics.orders);
  const spend = Math.max(0, metrics.spend);
  const sales = Math.max(0, metrics.sales);

  const ctr = impressions > 0 ? clicks / impressions : 0;
  const conversionRate = clicks > 0 ? orders / clicks : 0;
  const roas = spend > 0 ? sales / spend : 0;
  const acos = sales > 0 ? spend / sales : spend > 0 ? 1 : 0;

  let classification: SearchTermClassification = "NEUTRAL";

  /*
   * Deterministic candidate rules.
   *
   * AI does not decide whether a search term qualifies.
   * These rules create the candidate class first.
   */

  if (
    orders >= 2 &&
    conversionRate >= 0.05 &&
    acos <= 0.25
  ) {
    classification = "UNDERFUNDED_WINNER";
  } else if (orders >= 3 && conversionRate >= 0.05) {
    classification = "WINNER";
  } else if (
    orders === 0 &&
    clicks >= 15 &&
    spend > 0
  ) {
    classification = "HIGH_SPEND_ZERO_ORDER";
  } else if (
    orders === 0 &&
    spend > 0
  ) {
    classification = "WASTE";
  }

  return {
    impressions,
    clicks,
    orders,
    spend,
    sales,
    acos,
    classification,
    conversionRate,
    ctr,
    roas,
  };
}

