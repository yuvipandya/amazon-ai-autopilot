import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const amazonAccountId = searchParams.get("amazonAccountId") || searchParams.get("accountId");

    let account = null;
    if (amazonAccountId) {
      account = await prisma.amazonAccount.findUnique({
        where: { id: amazonAccountId },
      });
    }

    if (!account) {
      account = await prisma.amazonAccount.findFirst({
        orderBy: { createdAt: "asc" },
      });
    }

    if (!account) {
      return NextResponse.json(
        {
          success: false,
          error: "No Amazon account found.",
        },
        { status: 404 }
      );
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        amazonAccountId: account.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
      include: {
        recommendation: {
          include: {
            product: {
              select: {
                id: true,
                asin: true,
                title: true,
              },
            },
            campaign: {
              select: {
                id: true,
                name: true,
              },
            },
            keyword: {
              select: {
                id: true,
                value: true,
                matchType: true,
              },
            },
            searchTerm: {
              select: {
                id: true,
                value: true,
                classification: true,
              },
            },
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
          mode: account.isLiveAccount ? "REAL" : "DEMO",
        },
        logs,
        count: logs.length,
      },
    });
  } catch (error) {
    console.error("Activity API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load activity.",
      },
      { status: 500 }
    );
  }
}