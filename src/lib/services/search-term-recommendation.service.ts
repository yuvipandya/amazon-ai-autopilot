import { prisma } from "@/lib/prisma";
import {
  generateSearchTermRecommendation,
  SearchTermRecommendation,
} from "@/lib/engines/search-term-recommendation";
import { SearchTermClassification } from "@/lib/engines/search-term-intelligence";

export interface PersistedSearchTermRecommendation {
  recommendationId: string;
  searchTermId: string;
  value: string;
  actionType: SearchTermRecommendation["actionType"];
  classification: SearchTermClassification;
}

function buildIdempotencyKey(
  amazonAccountId: string,
  searchTermId: string,
  classification: SearchTermClassification,
  actionType: string
) {
  return `search-term:${amazonAccountId}:${searchTermId}:${classification}:${actionType}`;
}

export class SearchTermRecommendationService {
  static async generateForAccount(
    amazonAccountId: string
  ): Promise<PersistedSearchTermRecommendation[]> {
    const account = await prisma.amazonAccount.findUnique({
      where: {
        id: amazonAccountId,
      },
      select: {
        id: true,
        isLiveAccount: true,
      },
    });

    if (!account) {
      throw new Error("Amazon account not found.");
    }

    const searchTerms = await prisma.searchTerm.findMany({
      where: {
        campaign: {
          amazonAccountId,
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
            amazonAccountId: true,
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

      const idempotencyKey = buildIdempotencyKey(
        account.id,
        term.id,
        term.classification,
        recommendation.actionType
      );

      const existing = await prisma.recommendation.findFirst({
        where: {
          idempotencyKey,
        },
        select: {
          id: true,
        },
      });

      if (existing) {
        persisted.push({
          recommendationId: existing.id,
          searchTermId: term.id,
          value: term.value,
          actionType: recommendation.actionType,
          classification: term.classification,
        });
        continue;
      }

      const created = await prisma.recommendation.create({
        data: {
          amazonAccountId: account.id,
          campaignId: term.campaignId,
          searchTermId: term.id,
          actionType: recommendation.actionType,
          title:
            recommendation.actionType === "INCREASE_BID"
              ? `Increase bid: ${term.value}`
              : recommendation.actionType ===
                  "ADD_NEGATIVE_KEYWORD"
                ? `Add negative keyword: ${term.value}`
                : `Monitor search term: ${term.value}`,
          description: recommendation.reason,
          reason: recommendation.reason,
          currentValue: term.acos,
          recommendedValue:
            recommendation.actionType === "INCREASE_BID"
              ? Math.min(term.acos + 0.05, 1)
              : undefined,
          changePercent: undefined,
          expectedImpact:
            recommendation.actionType === "INCREASE_BID"
              ? "Potentially capture additional profitable traffic."
              : recommendation.actionType ===
                  "ADD_NEGATIVE_KEYWORD"
                ? "Reduce spend on non-converting search traffic."
                : "Maintain visibility and monitor future performance.",
          confidence:
            recommendation.priority === "HIGH"
              ? 0.9
              : recommendation.priority === "MEDIUM"
                ? 0.75
                : 0.6,
          risk:
            recommendation.actionType === "ADD_NEGATIVE_KEYWORD"
              ? "MEDIUM"
              : "LOW",
          status: "PENDING",
          executionState: "PENDING",
          approvalStatus: "PENDING",
          approvalSource: "HUMAN_APPROVAL",
          connectorMode: account.isLiveAccount
            ? "REAL"
            : "DEMO",
          dataWindow: "SEARCH_TERM_INTELLIGENCE",
          requiresApproval: true,
          idempotencyKey,
        },
        select: {
          id: true,
        },
      });

      persisted.push({
        recommendationId: created.id,
        searchTermId: term.id,
        value: term.value,
        actionType: recommendation.actionType,
        classification: term.classification,
      });
    }

    return persisted;
  }
}
