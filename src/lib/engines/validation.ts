import { prisma } from "@/lib/prisma";

type RecommendationInput = {
  id: string;
  actionType: string;
  currentValue: number | null;
  recommendedValue: number | null;
  changePercent: number | null;
  status: string;
  risk: string;
  requiresApproval: boolean;

 amazonAccount?: {
  id: string;
  maxBidChange: number;
  maxBudgetChange: number;
  status: string;
  automationLevel: number;
  automationPaused: boolean;
} | null;

  keyword?: {
    id: string;
    value: string;
    bid: number;
    status: string;
  } | null;

  campaign?: {
    id: string;
    name: string;
    dailyBudget: number;
    status: string;
  } | null;

  searchTerm?: {
    id: string;
    value: string;
    clicks: number;
    orders: number;
    spend: number;
    sales: number;
    classification: string;
  } | null;
};

export type ValidationCheck = {
  name: string;
  passed: boolean;
  message: string;
};

export type ValidationResult = {
  passed: boolean;
  checks: ValidationCheck[];
  reason: string;
};

/*
 * Absolute safety ceiling.
 *
 * The blueprint defines a maximum ±15% bid adjustment per cycle.
 * Seller settings can therefore make the limit MORE restrictive,
 * but cannot weaken this hard safety ceiling.
 */
const ABSOLUTE_MAX_BID_CHANGE_PERCENT = 15;

const DEFAULT_MAX_BUDGET_CHANGE_PERCENT = 20;

export async function validateRecommendation(
  recommendation: RecommendationInput
): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];

  checks.push({
    name: "Recommendation status",
    passed: recommendation.status === "PENDING",
    message:
      recommendation.status === "PENDING"
        ? "Recommendation is pending execution."
        : `Recommendation is already ${recommendation.status}.`,
  });

  if (recommendation.status !== "PENDING") {
    return {
      passed: false,
      checks,
      reason: "Only pending recommendations can be executed.",
    };
  }

  if (
    recommendation.actionType === "INCREASE_BID" ||
    recommendation.actionType === "DECREASE_BID"
  ) {
    const keyword = recommendation.keyword;

    checks.push({
      name: "Keyword exists",
      passed: Boolean(keyword),
      message: keyword
        ? `Keyword "${keyword.value}" exists.`
        : "Target keyword was not found.",
    });

    if (!keyword) {
      return {
        passed: false,
        checks,
        reason: "Target keyword does not exist.",
      };
    }

    const currentBid = recommendation.currentValue;
    const newBid = recommendation.recommendedValue;

    const valuesValid =
      currentBid !== null &&
      newBid !== null &&
      currentBid > 0 &&
      newBid > 0;

    checks.push({
      name: "Bid values valid",
      passed: valuesValid,
      message: valuesValid
        ? `₹${currentBid.toFixed(2)} → ₹${newBid.toFixed(2)}`
        : "Bid values must be positive.",
    });

    if (!valuesValid) {
      return {
        passed: false,
        checks,
        reason: "Invalid bid values.",
      };
    }

    const actualChangePercent =
      ((newBid - currentBid) / currentBid) * 100;

    /*
     * Seller-configured limit.
     *
     * Never allow the seller setting to exceed the blueprint's
     * absolute 15% per-cycle bid safety bound.
     */
    const configuredBidLimit =
      recommendation.amazonAccount?.maxBidChange ??
      ABSOLUTE_MAX_BID_CHANGE_PERCENT;

    const effectiveBidLimit = Math.min(
      configuredBidLimit,
      ABSOLUTE_MAX_BID_CHANGE_PERCENT
    );

    checks.push({
      name: "Bid safety bound",
      passed:
        Math.abs(actualChangePercent) <=
        effectiveBidLimit + 0.0001,
      message:
        Math.abs(actualChangePercent) <=
        effectiveBidLimit + 0.0001
          ? `Change is ${actualChangePercent.toFixed(
              2
            )}%, within the ${effectiveBidLimit}% limit.`
          : `Change is ${actualChangePercent.toFixed(
              2
            )}%, exceeding the ${effectiveBidLimit}% limit.`,
    });

    const currentValueMatches =
      Math.abs(keyword.bid - currentBid) < 0.001;

    checks.push({
      name: "Current value matches database",
      passed: currentValueMatches,
      message: currentValueMatches
        ? "Database bid matches recommendation."
        : `Database bid is ₹${keyword.bid.toFixed(
            2
          )}, but recommendation expects ₹${currentBid.toFixed(
            2
          )}.`,
    });

    const keywordActive =
      keyword.status === "ACTIVE";

    checks.push({
      name: "Keyword is active",
      passed: keywordActive,
      message: keywordActive
        ? "Keyword is active."
        : `Keyword status is ${keyword.status}.`,
    });

    const passed = checks.every(
      (check) => check.passed
    );

    return {
      passed,
      checks,
      reason: passed
        ? "All deterministic bid validation checks passed."
        : "One or more bid validation checks failed.",
    };
  }

  if (
    recommendation.actionType === "INCREASE_BUDGET" ||
    recommendation.actionType === "DECREASE_BUDGET"
  ) {
    const campaign = recommendation.campaign;

    checks.push({
      name: "Campaign exists",
      passed: Boolean(campaign),
      message: campaign
        ? `Campaign "${campaign.name}" exists.`
        : "Target campaign was not found.",
    });

    if (!campaign) {
      return {
        passed: false,
        checks,
        reason: "Target campaign does not exist.",
      };
    }

    const currentBudget =
      recommendation.currentValue;

    const newBudget =
      recommendation.recommendedValue;

    const valuesValid =
      currentBudget !== null &&
      newBudget !== null &&
      currentBudget > 0 &&
      newBudget > 0;

    checks.push({
      name: "Budget values valid",
      passed: valuesValid,
      message: valuesValid
        ? `₹${currentBudget.toFixed(
            2
          )} → ₹${newBudget.toFixed(2)}`
        : "Budget values must be positive.",
    });

    if (!valuesValid) {
      return {
        passed: false,
        checks,
        reason: "Invalid budget values.",
      };
    }

    const actualChangePercent =
      ((newBudget - currentBudget) /
        currentBudget) *
      100;

    const configuredBudgetLimit =
      recommendation.amazonAccount
        ?.maxBudgetChange ??
      DEFAULT_MAX_BUDGET_CHANGE_PERCENT;

    const withinBudgetBound =
      Math.abs(actualChangePercent) <=
      configuredBudgetLimit + 0.0001;

    checks.push({
      name: "Budget safety bound",
      passed: withinBudgetBound,
      message: withinBudgetBound
        ? `Change is ${actualChangePercent.toFixed(
            2
          )}%, within the ${configuredBudgetLimit}% limit.`
        : `Change is ${actualChangePercent.toFixed(
            2
          )}%, exceeding the ${configuredBudgetLimit}% limit.`,
    });

    const currentValueMatches =
      Math.abs(
        campaign.dailyBudget - currentBudget
      ) < 0.001;

    checks.push({
      name: "Current budget matches database",
      passed: currentValueMatches,
      message: currentValueMatches
        ? "Database budget matches recommendation."
        : `Database budget is ₹${campaign.dailyBudget.toFixed(
            2
          )}.`,
    });

    checks.push({
      name: "Campaign is active",
      passed: campaign.status === "ENABLED",
      message:
        campaign.status === "ENABLED"
          ? "Campaign is enabled."
          : `Campaign status is ${campaign.status}.`,
    });

    const passed = checks.every(
      (check) => check.passed
    );

    return {
      passed,
      checks,
      reason: passed
        ? "All deterministic budget validation checks passed."
        : "One or more budget validation checks failed.",
    };
  }

  if (
    recommendation.actionType ===
    "ADD_NEGATIVE_KEYWORD"
  ) {
    const searchTerm =
      recommendation.searchTerm;

    checks.push({
      name: "Search term exists",
      passed: Boolean(searchTerm),
      message: searchTerm
        ? `Search term "${searchTerm.value}" exists.`
        : "Search term was not found.",
    });

    if (!searchTerm) {
      return {
        passed: false,
        checks,
        reason: "Target search term does not exist.",
      };
    }

    const sufficientData =
      searchTerm.clicks >= 15 &&
      searchTerm.spend > 0;

    checks.push({
      name: "Minimum negative-keyword data",
      passed: sufficientData,
      message: sufficientData
        ? `${searchTerm.clicks} clicks and ₹${searchTerm.spend.toFixed(
            2
          )} spend provide enough evidence.`
        : "Insufficient performance data for a negative keyword.",
    });

    checks.push({
      name: "Search term classified as waste",
      passed:
        searchTerm.classification === "WASTE",
      message:
        searchTerm.classification === "WASTE"
          ? "Search term is classified as WASTE."
          : `Classification is ${searchTerm.classification}.`,
    });

    const passed = checks.every(
      (check) => check.passed
    );

    return {
      passed,
      checks,
      reason: passed
        ? "Negative-keyword validation passed."
        : "Negative-keyword validation failed.",
    };
  }

  if (
    recommendation.actionType ===
    "HARVEST_KEYWORD"
  ) {
    const searchTerm =
      recommendation.searchTerm;

    checks.push({
      name: "Search term exists",
      passed: Boolean(searchTerm),
      message: searchTerm
        ? `Search term "${searchTerm.value}" exists.`
        : "Search term was not found.",
    });

    if (!searchTerm) {
      return {
        passed: false,
        checks,
        reason: "Target search term does not exist.",
      };
    }

    checks.push({
      name: "Search term classified as winner",
      passed:
        searchTerm.classification === "WINNER",
      message:
        searchTerm.classification === "WINNER"
          ? "Search term is classified as WINNER."
          : `Classification is ${searchTerm.classification}.`,
    });

    checks.push({
      name: "Conversion evidence exists",
      passed: searchTerm.orders > 0,
      message:
        searchTerm.orders > 0
          ? `${searchTerm.orders} orders recorded.`
          : "No orders recorded.",
    });

    const duplicate =
      await prisma.keyword.findFirst({
        where: {
          campaignId:
            recommendation.campaign?.id ??
            "",
          value: searchTerm.value,
        },
      });

    const noDuplicate = !duplicate;

    checks.push({
      name: "Keyword does not already exist",
      passed: noDuplicate,
      message: noDuplicate
        ? "No duplicate keyword exists."
        : "Keyword already exists in the target campaign.",
    });

    const passed = checks.every(
      (check) => check.passed
    );

    return {
      passed,
      checks,
      reason: passed
        ? "Keyword-harvesting validation passed."
        : "Keyword-harvesting validation failed.",
    };
  }

  return {
    passed: false,
    checks: [
      ...checks,
      {
        name: "Supported action",
        passed: false,
        message: `Action ${recommendation.actionType} is not supported by the execution engine.`,
      },
    ],
    reason: "Unsupported recommendation action.",
  };
}