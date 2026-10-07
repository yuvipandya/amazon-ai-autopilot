import { NextResponse } from "next/server";
import { requireAuth, getAuthorizedProduct } from "@/lib/auth/authorization";
import { SearchTermIntelligenceService } from "@/lib/services/search-term-intelligence.service";
import { SearchTermRecommendationService } from "@/lib/services/search-term-recommendation.service";

export async function POST(request: Request) {
  try {
    await requireAuth();

    const body = await request.json();
    const productId = body?.productId as string | undefined;

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 },
      );
    }

    const product = await getAuthorizedProduct(productId);

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 },
      );
    }

    /*
     * ------------------------------------------------
     * 1. DETERMINISTIC INTELLIGENCE
     * ------------------------------------------------
     *
     * Refresh classifications from the persisted
     * search-term performance data.
     *
     * No LLM decides classification or authorization.
     */
    const analyzed =
      await SearchTermIntelligenceService.analyzeAccount(
        product.amazonAccountId,
      );

    /*
     * ------------------------------------------------
     * 2. DETERMINISTIC RECOMMENDATIONS
     * ------------------------------------------------
     *
     * Recommendations are persisted through the
     * dedicated service, including idempotency and
     * mandatory HUMAN_APPROVAL.
     */
    const recommendations =
      await SearchTermRecommendationService.generateForProduct(
        product.amazonAccountId,
        product.id,
      );

    const productSearchTermIds = new Set(
      product.campaigns.flatMap((campaign) =>
        campaign.searchTerms.map(
          (searchTerm) => searchTerm.id,
        ),
      ),
    );

    const productAnalyzed = analyzed.filter((term) =>
      productSearchTermIds.has(term.id),
    );

    const productRecommendations =
      recommendations.filter((recommendation) =>
        productSearchTermIds.has(
          recommendation.searchTermId,
        ),
      );

    return NextResponse.json({
      success: true,
      productId: product.id,
      analyzed: productAnalyzed.length,
      recommendations: productRecommendations.length,
      data: {
        classifications: productAnalyzed,
        recommendations: productRecommendations,
      },
    });
  } catch (error) {
    console.error(
      "Search-term analysis failed:",
      error,
    );

    return NextResponse.json(
      {
        error: "Search-term analysis failed",
      },
      { status: 500 },
    );
  }
}
