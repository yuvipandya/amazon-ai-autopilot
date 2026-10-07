import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBidRecommendation } from "@/lib/ai/gemini";
import { evaluateInventoryPpc } from "@/lib/engines/bi";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const productId = body?.productId as string | undefined;

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        amazonAccount: true,
        campaigns: {
          include: {
            keywords: true,
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    const keywords = product.campaigns.flatMap(
      (campaign) => campaign.keywords
    );

    let created = 0;
    let skipped = 0;
    let aiGenerated = 0;
    let aiFallback = 0;

    for (const keyword of keywords) {
      if (keyword.clicks < 15 || keyword.orders === 0) {
        skipped++;
        continue;
      }

      const existing = await prisma.recommendation.findFirst({
        where: {
          productId: product.id,
          keywordId: keyword.id,
          actionType: {
            in: [
              "INCREASE_BID",
              "DECREASE_BID",
            ],
          },
          status: "PENDING",
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const currentBid = keyword.bid;

      let action:
        | "INCREASE_BID"
        | "DECREASE_BID"
        | "NO_ACTION" = "NO_ACTION";

      const inv = evaluateInventoryPpc({
        inventory: product.inventory,
        inboundInventory: product.inboundInventory,
        unitsSold7d: Math.max(1, Math.round(product.inventory * 0.1)),
      });

      if (
        keyword.acos < product.targetAcos &&
        keyword.orders >= 3
      ) {
        // Prevent aggressive scaling if stock is low
        if (!inv.allowAggressiveScaling) {
          skipped++;
          continue;
        }
        action = "INCREASE_BID";
      } else if (
        keyword.acos > product.targetAcos * 1.2 &&
        keyword.orders >= 3
      ) {
        action = "DECREASE_BID";
      }

      if (action === "NO_ACTION") {
        skipped++;
        continue;
      }

      const maxChange = Math.min(
        product.amazonAccount.maxBidChange,
        15
      );

      let aiResult = null;

      try {
        aiResult = await generateBidRecommendation({
          keyword: keyword.value,
          currentBid,
          clicks: keyword.clicks,
          orders: keyword.orders,
          spend: keyword.spend,
          sales: keyword.sales,
          acos: keyword.acos,
          targetAcos: product.targetAcos,
          strategyMode: product.amazonAccount.strategyMode,
          maxBidChange: maxChange,
        });

        aiGenerated++;
      } catch (error) {
        console.error(
          `Gemini bid analysis failed for "${keyword.value}":`,
          error
        );

        aiFallback++;
      }

      const finalAction =
        aiResult?.action === action
          ? aiResult.action
          : action;

      const changePercent =
        finalAction === "INCREASE_BID"
          ? Math.min(10, maxChange)
          : -Math.min(10, maxChange);

      const recommendedBid =
        currentBid * (1 + changePercent / 100);

      const title =
        aiResult?.action === finalAction
          ? aiResult.title
          : finalAction === "INCREASE_BID"
            ? "Increase Bid on High-Performing Keyword"
            : "Decrease Bid on Inefficient Keyword";

      const description =
        aiResult?.action === finalAction
          ? aiResult.description
          : `Keyword "${keyword.value}" has ${keyword.orders} orders from ${keyword.clicks} clicks with an ACoS of ${(keyword.acos * 100).toFixed(1)}%.`;

      const reason =
        aiResult?.action === finalAction
          ? aiResult.reason
          : finalAction === "INCREASE_BID"
            ? "The keyword is converting efficiently below the product target ACoS."
            : "The keyword is performing above the product target ACoS.";

      const expectedImpact =
        aiResult?.action === finalAction
          ? aiResult.expectedImpact
          : finalAction === "INCREASE_BID"
            ? "Potentially capture additional qualified traffic while remaining within the bid safety limit."
            : "Potentially reduce inefficient advertising spend while preserving the keyword.";

      const confidence =
        aiResult?.action === finalAction
          ? Math.min(1, Math.max(0, aiResult.confidence))
          : 0.75;

      const risk =
        aiResult?.action === finalAction
          ? aiResult.risk
          : "LOW";

      await prisma.recommendation.create({
        data: {
          amazonAccountId: product.amazonAccountId,
          productId: product.id,
          campaignId: keyword.campaignId,
          keywordId: keyword.id,

          actionType: finalAction,

          title,
          description,
          reason,

          currentValue: currentBid,
          recommendedValue: recommendedBid,
          changePercent,

          expectedImpact,
          confidence,
          risk,

          status: "PENDING",
          approvalStatus: "PENDING",

          dataWindow: "7 days",
          requiresApproval: true,
        },
      });

      created++;
    }

    return NextResponse.json({
      success: true,
      productId: product.id,
      analyzed: keywords.length,
      created,
      skipped,
      ai: {
        generated: aiGenerated,
        fallback: aiFallback,
      },
    });
  } catch (error) {
    console.error("Bid analysis failed:", error);

    return NextResponse.json(
      {
        error: "Bid analysis failed",
      },
      {
        status: 500,
      }
    );
  }
}