import { prisma } from "@/lib/prisma";
import {
  generateSearchTermRecommendation,
  SearchTermRecommendation,
} from "@/lib/engines/search-term-recommendation";
import { SearchTermClassification } from "@/lib/engines/search-term-intelligence";
import {
  persistSearchTermRecommendation,
  type RecommendationStore,
} from "./search-term-recommendation.persistence";

export interface PersistedSearchTermRecommendation {
  recommendationId: string;
  searchTermId: string;
  value: string;
  actionType: SearchTermRecommendation["actionType"];
  classification: SearchTermClassification;
  matchType?: "EXACT" | "PHRASE" | "BROAD";
  recommendedBid?: number;
}

function buildIdempotencyKey(
  amazonAccountId: string,
  searchTermId: string,
  classification: SearchTermClassification,
  actionType: string
) {
  return `search-term:${amazonAccountId}:${searchTermId}:${classification}:${actionType}`;
}

function calculateMedian(values: number[]): number | null {
  const valid = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (valid.length === 0) {
    return null;
  }

  const middle = Math.floor(valid.length / 2);

  if (valid.length % 2 === 0) {
    return (valid[middle - 1] + valid[middle]) / 2;
  }

  return valid[middle];
}

function calculateHarvestBid(activeBids: number[]): number {
  const medianBid = calculateMedian(activeBids);

  if (medianBid === null) {
    return 1;
  }

  return Number(Math.max(0.5, medianBid).toFixed(2));
}

export class SearchTermRecommendationService {
  static async generateForProduct(
    amazonAccountId: string,
    productId: string
  ): Promise<PersistedSearchTermRecommendation[]> {
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        amazonAccountId,
      },
      select: {
        id: true,
        amazonAccountId: true,
        amazonAccount: {
          select: {
            isLiveAccount: true,
          },
        },
      },
    });

    if (!product) {
      throw new Error("Product not found for Amazon account.");
    }

    const searchTerms = await prisma.searchTerm.findMany({
      where: {
        campaign: {
          amazonAccountId,
          productId,
        },
        classification: {
          not: "NEUTRAL",
        },
      },
      select: {
        id: true,
        campaignId: true,
        value: true,
        classification: true,
        impressions: true,
        clicks: true,
        orders: true,
        spend: true,
        sales: true,
        acos: true,
        campaign: {
          select: {
            keywords: {
              where: {
                status: "ACTIVE",
              },
              select: {
                value: true,
                matchType: true,
                bid: true,
              },
            },
          },
        },
      },
    });

    const persisted: PersistedSearchTermRecommendation[] = [];

    for (const term of searchTerms) {
      const recommendation =
        generateSearchTermRecommendation({
          value: term.value,
          classification: term.classification,
          orders: term.orders,
          spend: term.spend,
          sales: term.sales,
          acos: term.acos,
        });

      if (!recommendation) {
        continue;
      }

      const isHarvest =
        recommendation.actionType === "HARVEST_KEYWORD";

      const isNegative =
        recommendation.actionType === "ADD_NEGATIVE_KEYWORD";

      const matchType = isHarvest ? "EXACT" : undefined;

      const normalizedSearchTerm = term.value.trim().toLowerCase();

      const exactKeyword = term.campaign.keywords.find(
        (keyword) =>
          keyword.matchType.toUpperCase() === "EXACT" &&
          keyword.value.trim().toLowerCase() ===
            normalizedSearchTerm
      );

      const existingKeywordCoverage =
        term.campaign.keywords.find(
          (keyword) =>
            keyword.value.trim().toLowerCase() ===
              normalizedSearchTerm &&
            keyword.matchType.toUpperCase() !== "EXACT"
        );

      /*
       * Never recommend harvesting a search term that already exists
       * as an EXACT keyword.
       */
      if (isHarvest && exactKeyword) {
        continue;
      }

      /*
       * If the term is already covered by PHRASE/BROAD targeting,
       * don't blindly create another target. The existing targeting
       * may already be capturing the demand.
       */
      if (isHarvest && existingKeywordCoverage) {
        continue;
      }

      const recommendedBid = isHarvest
        ? calculateHarvestBid(
            term.campaign.keywords.map(
              (keyword) => keyword.bid
            )
          )
        : undefined;

      const idempotencyKey = buildIdempotencyKey(
        product.amazonAccountId,
        term.id,
        term.classification,
        recommendation.actionType
      );

      
      const title = isHarvest
        ? `Harvest keyword: ${term.value}`
        : `Add negative keyword: ${term.value}`;

      const expectedImpact = isHarvest
        ? `Promote proven search demand into an EXACT keyword at a starting bid of ₹${recommendedBid?.toFixed(2)} after human approval.`
        : "Reduce spend on non-converting search traffic.";

      const confidence =
        recommendation.priority === "HIGH"
          ? 0.9
          : recommendation.priority === "MEDIUM"
            ? 0.75
            : 0.6;

      const risk = isNegative ? "MEDIUM" : "LOW";

      const connectorMode = product.amazonAccount.isLiveAccount
        ? "REAL"
        : "DEMO";

      const result = await persistSearchTermRecommendation(
        prisma.recommendation as unknown as RecommendationStore,
        {
          amazonAccountId: product.amazonAccountId,
          productId: product.id,
          searchTermId: term.id,
          idempotencyKey,
          // Applied only to a recommendation that is still fully PENDING.
          refreshData: {
            productId: product.id,
            title,
            description: recommendation.reason,
            reason: recommendation.reason,
            currentValue: term.acos,
            recommendedValue: isHarvest ? recommendedBid : null,
            expectedImpact,
            confidence,
            risk,
            requiresApproval: true,
            approvalSource: "HUMAN_APPROVAL",
            connectorMode,
          },
          createData: {
            amazonAccountId: product.amazonAccountId,
            productId: product.id,
            campaignId: term.campaignId,
            searchTermId: term.id,
            actionType: recommendation.actionType,
            title,
            description: recommendation.reason,
            reason: recommendation.reason,
            currentValue: term.acos,
            recommendedValue: isHarvest ? recommendedBid : undefined,
            changePercent: undefined,
            expectedImpact,
            confidence,
            risk,
            status: "PENDING",
            executionState: "PENDING",
            approvalStatus: "PENDING",
            approvalSource: "HUMAN_APPROVAL",
            connectorMode,
            dataWindow: "SEARCH_TERM_INTELLIGENCE",
            requiresApproval: true,
            idempotencyKey,
          },
        }
      );

      // Non-pending history and concurrently changed rows are left untouched
      // and are not reported as persisted.
      if (
        result.outcome !== "CREATED" &&
        result.outcome !== "REFRESHED"
      ) {
        continue;
      }

      persisted.push({
        recommendationId: result.recommendationId,
        searchTermId: term.id,
        value: term.value,
        actionType: recommendation.actionType,
        classification: term.classification,
        matchType,
        recommendedBid,
      });
    }

    return persisted;
  }
}
