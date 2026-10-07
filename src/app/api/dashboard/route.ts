import { NextResponse } from "next/server";
import { getDashboardMetrics } from "@/lib/analytics";
import { requireAuth, getAuthorizedAccount } from "@/lib/auth/authorization";

export async function GET(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const amazonAccountId = searchParams.get("amazonAccountId") || searchParams.get("accountId") || undefined;
    const requestedOrganizationId = searchParams.get("organizationId");

    if (requestedOrganizationId && requestedOrganizationId !== session.user.organizationId) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    if (amazonAccountId) {
      const account = await getAuthorizedAccount(amazonAccountId);
      if (!account) {
        return NextResponse.json({ success: false, error: "Account not found." }, { status: 404 });
      }
    }

    const organizationId = session.user.organizationId;

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
