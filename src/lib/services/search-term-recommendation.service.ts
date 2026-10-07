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
        product.amazonAccountId,
        term.id,
        term.classification,
        recommendation.actionType
      );

      const existing =
        await prisma.recommendation.findFirst({
          where: {
            idempotencyKey,
            amazonAccountId: product.amazonAccountId,
            searchTermId: term.id,
          },
          select: {
            id: true,
            productId: true,
          },
        });

      if (existing) {
        if (
          existing.productId &&
          existing.productId !== product.id
        ) {
          throw new Error(
            `Recommendation ${existing.id} has conflicting product ownership.`
          );
        }

        if (!existing.productId) {
          await prisma.recommendation.update({
            where: {
              id: existing.id,
            },
            data: {
              productId: product.id,
            },
          });
        }

        persisted.push({
          recommendationId: existing.id,
          searchTermId: term.id,
          value: term.value,
          actionType: recommendation.actionType,
          classification: term.classification,
        });
        continue;
      }

      const created =
        await prisma.recommendation.create({
          data: {
            amazonAccountId: product.amazonAccountId,
            productId: product.id,
            campaignId: term.campaignId,
            searchTermId: term.id,
            actionType: recommendation.actionType,
            title:
              recommendation.actionType === "HARVEST_KEYWORD"
                ? `Increase bid: ${term.value}`
                : recommendation.actionType ===
                    "ADD_NEGATIVE_KEYWORD"
                  ? `Add negative keyword: ${term.value}`
                  : `Monitor search term: ${term.value}`,
            description: recommendation.reason,
            reason: recommendation.reason,
            currentValue: term.acos,
            recommendedValue:
              recommendation.actionType === "HARVEST_KEYWORD"
                ? Math.min(term.acos + 0.05, 1)
                : undefined,
            changePercent: undefined,
            expectedImpact:
              recommendation.actionType === "HARVEST_KEYWORD"
                ? "Promote proven search demand into a dedicated keyword after human approval."
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
              recommendation.actionType ===
              "ADD_NEGATIVE_KEYWORD"
                ? "MEDIUM"
                : "LOW",
            status: "PENDING",
            executionState: "PENDING",
            approvalStatus: "PENDING",
            approvalSource: "HUMAN_APPROVAL",
            connectorMode:
              product.amazonAccount.isLiveAccount
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
