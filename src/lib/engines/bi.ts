import { SearchTermClassification } from "@/generated/prisma/client";

export interface ContributionEconomics {
  revenue: number;
  adSpend: number;
  productCost: number; // COGS
  estimatedFbaFees: number;
  estimatedReferralFees: number;
  contributionProfit: number;
  contributionMarginPercent: number;
  acos: number;
  tacos: number;
  roas: number;
  breakEvenAcos: number;
}

export interface InventoryPpcStatus {
  inventory: number;
  inboundInventory: number;
  totalInventory: number;
  unitsSold7d: number;
  dailyVelocity: number;
  daysOfCover: number;
  inventoryHealth: "CRITICAL_LOW" | "LOW_STOCK" | "HEALTHY" | "OVERSTOCK";
  allowAggressiveScaling: boolean;
  recommendedBidModifier: number; // e.g., 0.85 (-15%) if low stock, 1.0 if healthy
  reason: string;
}

/**
 * Calculates Contribution Profit, TACoS, and Break-even economics
 */
export function calculateContributionEconomics(params: {
  revenue: number;
  adSpend: number;
  unitsSold: number;
  unitCost: number;
  unitPrice: number;
  referralFeePercent?: number; // Default 15% (Amazon standard)
  fbaFeePerUnit?: number; // Default ₹50
}): ContributionEconomics {
  const {
    revenue,
    adSpend,
    unitsSold,
    unitCost,
    unitPrice,
    referralFeePercent = 0.15,
    fbaFeePerUnit = 50,
  } = params;

  const productCost = unitsSold * unitCost;
  const estimatedReferralFees = revenue * referralFeePercent;
  const estimatedFbaFees = unitsSold * fbaFeePerUnit;

  const contributionProfit =
    revenue - productCost - adSpend - estimatedReferralFees - estimatedFbaFees;

  const contributionMarginPercent =
    revenue > 0 ? (contributionProfit / revenue) * 100 : 0;

  const acos = revenue > 0 ? adSpend / revenue : 0;
  const tacos = revenue > 0 ? adSpend / revenue : 0; // In account-wide context, adSpend / totalBrandRevenue
  const roas = adSpend > 0 ? revenue / adSpend : 0;

  // Break-even ACoS = (Price - Cost - Fees) / Price
  const grossProfitPerUnit =
    unitPrice - unitCost - unitPrice * referralFeePercent - fbaFeePerUnit;
  const breakEvenAcos =
    unitPrice > 0 ? Math.max(0, grossProfitPerUnit / unitPrice) : 0;

  return {
    revenue: Number(revenue.toFixed(2)),
    adSpend: Number(adSpend.toFixed(2)),
    productCost: Number(productCost.toFixed(2)),
    estimatedFbaFees: Number(estimatedFbaFees.toFixed(2)),
    estimatedReferralFees: Number(estimatedReferralFees.toFixed(2)),
    contributionProfit: Number(contributionProfit.toFixed(2)),
    contributionMarginPercent: Number(contributionMarginPercent.toFixed(2)),
    acos: Number(acos.toFixed(4)),
    tacos: Number(tacos.toFixed(4)),
    roas: Number(roas.toFixed(2)),
    breakEvenAcos: Number(breakEvenAcos.toFixed(4)),
  };
}

/**
 * Inventory-Aware PPC Safety Check
 * Protects products from running out of stock due to aggressive ad scaling
 */
export function evaluateInventoryPpc(params: {
  inventory: number;
  inboundInventory?: number;
  unitsSold7d: number;
}): InventoryPpcStatus {
  const { inventory, inboundInventory = 0, unitsSold7d } = params;
  const totalInventory = inventory + inboundInventory;
  const dailyVelocity = unitsSold7d > 0 ? unitsSold7d / 7 : 0.5; // Minimum baseline
  const daysOfCover = dailyVelocity > 0 ? totalInventory / dailyVelocity : 999;

  let inventoryHealth: InventoryPpcStatus["inventoryHealth"] = "HEALTHY";
  let allowAggressiveScaling = true;
  let recommendedBidModifier = 1.0;
  let reason = "Inventory cover is healthy. Standard PPC optimization permitted.";

  if (daysOfCover < 7) {
    inventoryHealth = "CRITICAL_LOW";
    allowAggressiveScaling = false;
    recommendedBidModifier = 0.85; // Throttle bids by 15%
    reason = `CRITICAL: Only ${Math.round(daysOfCover)} days of cover remaining. Restricting ad scaling to prevent stockout.`;
  } else if (daysOfCover < 14) {
    inventoryHealth = "LOW_STOCK";
    allowAggressiveScaling = false;
    recommendedBidModifier = 0.95;
    reason = `WARNING: ${Math.round(daysOfCover)} days of cover remaining. Pausing aggressive budget and bid increases.`;
  } else if (daysOfCover > 90) {
    inventoryHealth = "OVERSTOCK";
    allowAggressiveScaling = true;
    recommendedBidModifier = 1.05;
    reason = `OVERSTOCK: ${Math.round(daysOfCover)} days of cover. Ad scaling encouraged to liquidate excess inventory.`;
  }

  return {
    inventory,
    inboundInventory,
    totalInventory,
    unitsSold7d,
    dailyVelocity: Number(dailyVelocity.toFixed(2)),
    daysOfCover: Number(daysOfCover.toFixed(1)),
    inventoryHealth,
    allowAggressiveScaling,
    recommendedBidModifier,
    reason,
  };
}

/**
 * Enhanced Search Term Classifier with statistical confidence and sample sizes
 */
export function classifySearchTerm(params: {
  value: string;
  clicks: number;
  orders: number;
  spend: number;
  sales: number;
  targetAcos: number;
  brandKeywords?: string[];
  competitorKeywords?: string[];
}): {
  classification: SearchTermClassification;
  confidence: number;
  reason: string;
  actionRecommendation: "HARVEST_KEYWORD" | "ADD_NEGATIVE_KEYWORD" | "NONE";
} {
  const {
    value,
    clicks,
    orders,
    spend,
    sales,
    targetAcos,
    brandKeywords = [],
    competitorKeywords = [],
  } = params;

  const lowerVal = value.toLowerCase();

  // Brand check
  if (brandKeywords.some((b) => lowerVal.includes(b.toLowerCase()))) {
    return {
      classification: "BRAND",
      confidence: 0.95,
      reason: "Search term contains identified brand name or trademark.",
      actionRecommendation: orders > 0 ? "HARVEST_KEYWORD" : "NONE",
    };
  }

  // Competitor check
  if (competitorKeywords.some((c) => lowerVal.includes(c.toLowerCase()))) {
    return {
      classification: "COMPETITOR",
      confidence: 0.9,
      reason: "Search term targets known competitor brand or ASIN.",
      actionRecommendation: orders > 0 ? "HARVEST_KEYWORD" : "NONE",
    };
  }

  // Insufficient sample size check (requires at least 10 clicks to evaluate meaningfully)
  if (clicks < 10 && orders === 0) {
    return {
      classification: "INSUFFICIENT_DATA",
      confidence: 0.5,
      reason: `Insufficient sample size (${clicks} clicks, 0 orders). Minimum 10 clicks needed.`,
      actionRecommendation: "NONE",
    };
  }

  const acos = sales > 0 ? spend / sales : 999;
  const cvr = clicks > 0 ? orders / clicks : 0;

  // 1. HIGH SPEND ZERO ORDER (Definite waste)
  if (orders === 0 && clicks >= 15 && spend > 0) {
    return {
      classification: "HIGH_SPEND_ZERO_ORDER",
      confidence: Math.min(0.98, 0.8 + (clicks - 15) * 0.01),
      reason: `Wasted spend of ₹${spend.toFixed(0)} across ${clicks} clicks with 0 orders.`,
      actionRecommendation: "ADD_NEGATIVE_KEYWORD",
    };
  }

  // 2. WINNERS
  if (orders >= 2 && acos <= targetAcos) {
    return {
      classification: "WINNER",
      confidence: Math.min(0.99, 0.85 + orders * 0.02),
      reason: `Strong converter: ${orders} orders with ${(acos * 100).toFixed(1)}% ACoS (below target ${(targetAcos * 100).toFixed(1)}%).`,
      actionRecommendation: "HARVEST_KEYWORD",
    };
  }

  // 3. UNDERFUNDED WINNER
  if (orders >= 1 && acos <= targetAcos * 0.7 && clicks >= 5) {
    return {
      classification: "UNDERFUNDED_WINNER",
      confidence: 0.9,
      reason: `Exceptional conversion efficiency (${(acos * 100).toFixed(1)}% ACoS). High potential for aggressive budget allocation.`,
      actionRecommendation: "HARVEST_KEYWORD",
    };
  }

  // 4. PROMISING (Single order converter early in lifecycle)
  if (orders === 1 && acos <= targetAcos * 1.1) {
    return {
      classification: "PROMISING",
      confidence: 0.78,
      reason: `Early converter: 1 order from ${clicks} clicks. Monitoring for statistical significance.`,
      actionRecommendation: "NONE",
    };
  }

  // 5. EXPENSIVE CONVERTER
  if (orders >= 2 && acos > targetAcos * 1.5) {
    return {
      classification: "EXPENSIVE_CONVERTER",
      confidence: 0.85,
      reason: `Converts (${orders} orders) but at an unprofitable ${(acos * 100).toFixed(1)}% ACoS.`,
      actionRecommendation: "NONE", // Bid reduction or target adjustment instead of negative
    };
  }

  // 6. HIGH TRAFFIC LOW CVR
  if (clicks >= 30 && cvr < 0.03 && orders <= 1) {
    return {
      classification: "HIGH_TRAFFIC_LOW_CVR",
      confidence: 0.88,
      reason: `High traffic (${clicks} clicks) but poor CVR (${(cvr * 100).toFixed(1)}%). Draining budget.`,
      actionRecommendation: orders === 0 ? "ADD_NEGATIVE_KEYWORD" : "NONE",
    };
  }

  // 7. General Waste fallback
  if (orders === 0 && clicks >= 12) {
    return {
      classification: "WASTE",
      confidence: 0.82,
      reason: `${clicks} clicks with zero conversions.`,
      actionRecommendation: "ADD_NEGATIVE_KEYWORD",
    };
  }

  return {
    classification: "NEUTRAL",
    confidence: 0.7,
    reason: "Performance within acceptable variance boundary.",
    actionRecommendation: "NONE",
  };
}
