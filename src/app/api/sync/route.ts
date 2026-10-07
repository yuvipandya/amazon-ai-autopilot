import { NextResponse } from "next/server";
import { IngestionService } from "@/lib/services/ingestion.service";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    let amazonAccountId = body?.amazonAccountId;

    if (!amazonAccountId) {
      const active = await prisma.amazonAccount.findFirst({
        where: { status: "ACTIVE" },
      });
      amazonAccountId = active?.id;
    }

    if (!amazonAccountId) {
      return NextResponse.json(
        { success: false, error: "No Amazon account found to sync" },
        { status: 404 }
      );
    }

    const result = await IngestionService.syncAccountData({
      amazonAccountId,
      reportPeriod: body?.reportPeriod || "LAST_14_DAYS",
    });

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
