import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateSearchTermRecommendation,
} from "@/lib/ai/gemini";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const productId = body?.productId as string | undefined;

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 },
      );
    }

    const product = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: {
        amazonAccount: true,
        campaigns: {
          include: {
            searchTerms: true,
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 },
      );
    }

    const searchTerms = product.campaigns.flatMap(
      (campaign) => campaign.searchTerms,
    );

    let created = 0;
    let skipped = 0;
    let aiGenerated = 0;
    let aiFallback = 0;

    for (const term of searchTerms) {
      let actionType:
        | "HARVEST_KEYWORD"
        | "ADD_NEGATIVE_KEYWORD"
        | null = null;

      /*
       * ------------------------------------------------
       * DETERMINISTIC CANDIDATE DETECTION
       * ------------------------------------------------
       *
       * The code decides whether an action is allowed.
       * Gemini does NOT get to override these rules.
       */

      if (
        (term.classification === "WINNER" ||
          term.classification === "UNDERFUNDED_WINNER") &&
        term.orders > 0
      ) {
        actionType = "HARVEST_KEYWORD";
      }

      if (
        (term.classification === "WASTE" ||
          term.classification === "HIGH_SPEND_ZERO_ORDER") &&
        term.clicks >= 15 &&
        term.orders === 0
      ) {
        actionType = "ADD_NEGATIVE_KEYWORD";
      }

      if (!actionType) {
        skipped += 1;
        continue;
      }

      /*
       * ------------------------------------------------
       * DUPLICATE CHECK
       * ------------------------------------------------
       */

      const existing =
        await prisma.recommendation.findFirst({
          where: {
            productId: product.id,
            searchTermId: term.id,
            actionType,
            status: "PENDING",
          },
        });

      if (existing) {
        skipped += 1;
        continue;
      }

      /*
       * ------------------------------------------------
       * GEMINI REASONING
       * ------------------------------------------------
       */

      let aiResult:
        | Awaited<
            ReturnType<
              typeof generateSearchTermRecommendation
            >
          >
        | null = null;

      try {
        aiResult =
          await generateSearchTermRecommendation({
            value: term.value,
            classification:
              term.classification,
            clicks: term.clicks,
            orders: term.orders,
            spend: term.spend,
            sales: term.sales,
            acos: term.acos,
          });

        aiGenerated += 1;
      } catch (error) {
        /*
         * AI failure must never break the deterministic
         * recommendation pipeline.
         *
         * We fall back to safe deterministic copy.
         */
        console.error(
          `Gemini analysis failed for "${term.value}":`,
          error,
        );

        aiFallback += 1;
      }

      /*
       * ------------------------------------------------
       * DETERMINISTIC ACTION AUTHORITY
       * ------------------------------------------------
       *
       * Even if Gemini returns a different action,
       * we use the action determined by our rules.
       */

      const title =
        aiResult?.action === actionType
          ? aiResult.title
          : actionType === "HARVEST_KEYWORD"
            ? `Harvest winning search term: ${term.value}`
            : `Block waste search term: ${term.value}`;

      const description =
        aiResult?.action === actionType
          ? aiResult.description
          : actionType === "HARVEST_KEYWORD"
            ? "This search term is generating conversions and can be promoted into a keyword for controlled optimization."
            : "This search term has accumulated enough clicks without producing an order and is a candidate for negative targeting.";

      const reason =
        aiResult?.action === actionType
          ? aiResult.reason
          : actionType === "HARVEST_KEYWORD"
            ? `${term.orders} orders from ${term.clicks} clicks with ${Math.round(
                term.acos * 1000,
              ) / 10}% ACoS.`
            : `${term.clicks} clicks and ₹${Math.round(
                term.spend,
              )} spend with 0 orders.`;

      const expectedImpact =
        aiResult?.action === actionType
          ? aiResult.expectedImpact
          : actionType === "HARVEST_KEYWORD"
            ? "Capture proven search demand with a dedicated keyword."
            : "Reduce spend on traffic that has not converted.";

      /*
       * Gemini confidence/risk are advisory.
       *
       * The execution pipeline still performs its own
       * deterministic validation, policy and risk checks.
       */
      const confidence =
        aiResult?.action === actionType
          ? Math.min(
              1,
              Math.max(0, aiResult.confidence),
            )
          : actionType === "HARVEST_KEYWORD"
            ? Math.min(
                0.95,
                0.75 +
                  Math.min(
                    term.orders / 50,
                    0.2,
                  ),
              )
            : Math.min(
                0.97,
                0.8 +
                  Math.min(
                    term.clicks / 100,
                    0.17,
                  ),
              );

      const risk =
        aiResult?.action === actionType
          ? aiResult.risk
          : "LOW";

      /*
       * ------------------------------------------------
       * CREATE RECOMMENDATION
       * ------------------------------------------------
       */

      await prisma.recommendation.create({
        data: {
          amazonAccountId:
            product.amazonAccountId,

          productId:
            product.id,

          campaignId:
            product.campaigns.find((campaign) =>
              campaign.searchTerms.some(
                (searchTerm) =>
                  searchTerm.id === term.id,
              ),
            )?.id ?? null,

          searchTermId:
            term.id,

          actionType,

          title,

          description,

          reason,

          currentValue: 0,

          recommendedValue: 0,

          changePercent: 0,

          expectedImpact,

          confidence,

          risk,

          status: "PENDING",

          approvalStatus: "PENDING",

          dataWindow: "7 days",

          requiresApproval: true,
        },
      });

      created += 1;
    }

    return NextResponse.json({
      success: true,

      productId: product.id,

      analyzed: searchTerms.length,

      created,

      skipped,

      ai: {
        generated: aiGenerated,
        fallback: aiFallback,
      },
    });
  } catch (error) {
    console.error(
      "Search-term analysis failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Search-term analysis failed",
      },
      { status: 500 },
    );
  }
}