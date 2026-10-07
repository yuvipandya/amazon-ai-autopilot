import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getAuthorizedAccount } from "@/lib/auth/authorization";

export async function GET(request: Request) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const amazonAccountId = searchParams.get("amazonAccountId") || searchParams.get("accountId");

    let account = null;
    if (amazonAccountId) {
      account = await getAuthorizedAccount(amazonAccountId);
    }

    if (!account) {
      const session = await requireAuth();
      account = await prisma.amazonAccount.findFirst({
        where: {
          status: "ACTIVE",
          organizationId: session.user.organizationId,
        },
      });
    }

    if (!account) {
      return NextResponse.json(
        {
          success: false,
          error: "No active Amazon account found.",
        },
        { status: 404 }
      );
    }

    const recommendations = await prisma.recommendation.findMany({
      where: {
        amazonAccountId: account.id,
        status: "PENDING",
      },
      orderBy: [
        { confidence: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        product: {
          select: {
            id: true,
            asin: true,
            title: true,
            price: true,
            targetAcos: true,
            listingScore: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
            targetingType: true,
            dailyBudget: true,
            acos: true,
            roas: true,
          },
        },
        keyword: {
          select: {
            id: true,
            value: true,
            matchType: true,
            bid: true,
            clicks: true,
            orders: true,
            spend: true,
            sales: true,
            acos: true,
          },
        },
        searchTerm: {
          select: {
            id: true,
            value: true,
            classification: true,
            clicks: true,
            orders: true,
            spend: true,
            sales: true,
            acos: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        account: {
          id: account.id,
          sellerName: account.sellerName,
          marketplace: account.marketplace,
          mode: account.isLiveAccount ? "REAL" : "DEMO",
        },
        recommendations,
        count: recommendations.length,
      },
    });
  } catch (error) {
    console.error("Recommendations API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load recommendations.",
      },
      { status: 500 }
    );
  }
}
