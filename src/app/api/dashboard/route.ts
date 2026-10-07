import { NextResponse } from "next/server";
import { getDashboardMetrics } from "@/lib/analytics";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const amazonAccountId = searchParams.get("amazonAccountId") || searchParams.get("accountId") || undefined;
    const organizationId = searchParams.get("organizationId") || undefined;

    const data = await getDashboardMetrics({
      amazonAccountId,
      organizationId,
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);

    const isNotFound = error instanceof Error && error.message.includes("not found");
    const isDenied = error instanceof Error && error.message.includes("Access denied");

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load dashboard",
      },
      { status: isNotFound ? 404 : isDenied ? 403 : 500 }
    );
  }
}