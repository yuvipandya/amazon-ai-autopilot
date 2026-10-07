import { SearchTermClassification } from "@/lib/engines/search-term-intelligence";

export type SearchTermRecommendationAction =
  | "HARVEST_KEYWORD"
  | "ADD_NEGATIVE_KEYWORD";

export interface SearchTermRecommendation {
  actionType: SearchTermRecommendationAction;
  classification: SearchTermClassification;
  priority: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  requiresApproval: true;
  autonomousEligible: false;
}

export interface SearchTermRecommendationInput {
  value: string;
  classification: SearchTermClassification;
  orders: number;
  spend: number;
  sales: number;
  acos: number;
}

export function generateSearchTermRecommendation(
  input: SearchTermRecommendationInput
): SearchTermRecommendation | null {
  switch (input.classification) {
    case "UNDERFUNDED_WINNER":
      return {
        actionType: "HARVEST_KEYWORD",
        classification: input.classification,
        priority: "HIGH",
        reason:
          `"${input.value}" is converting efficiently with ${input.orders} orders ` +
          `and ${(input.acos * 100).toFixed(1)}% ACOS. Consider harvesting it as a dedicated keyword.`,
        requiresApproval: true,
        autonomousEligible: false,
      };

    case "HIGH_SPEND_ZERO_ORDER":
      return {
        actionType: "ADD_NEGATIVE_KEYWORD",
        classification: input.classification,
        priority: "HIGH",
        reason:
          `"${input.value}" has spent ?${input.spend.toFixed(2)} with zero orders. ` +
          `Consider adding it as a negative keyword.`,
        requiresApproval: true,
        autonomousEligible: false,
      };

    case "WASTE":
      return {
        actionType: "ADD_NEGATIVE_KEYWORD",
        classification: input.classification,
        priority: "MEDIUM",
        reason:
          `"${input.value}" has generated spend without conversions. ` +
          `Review before adding it as a negative keyword.`,
        requiresApproval: true,
        autonomousEligible: false,
      };

    case "NEUTRAL":
      return null;

    default:
      return null;
  }
}
