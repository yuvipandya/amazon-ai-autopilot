import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AmazonAuthService } from "@/lib/amazon/auth.service";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "DOWN";
  let dbLatencyMs = 0;
  let accountCount = 0;
  let hasLiveAccount = false;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = "HEALTHY";

    const accounts = await prisma.amazonAccount.findMany({
      select: { id: true, isLiveAccount: true, status: true },
    });
    accountCount = accounts.length;
    hasLiveAccount = accounts.some((a) => a.isLiveAccount);
  } catch (err: any) {
    dbStatus = `UNHEALTHY: ${err.message}`;
  }

  const geminiConfigured = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0
  );

  const amazonStatus = AmazonAuthService.getCredentialStatus();
  const connectorMode = hasLiveAccount && amazonStatus.configured ? "REAL" : "DEMO";

  const isHealthy = dbStatus === "HEALTHY";

  return NextResponse.json(
    {
      status: isHealthy ? "OK" : "DEGRADED",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        accounts: accountCount,
      },
      ai: {
        provider: "Google Gemini",
        configured: geminiConfigured,
        model: "gemini-3.5-flash-lite",
      },
      amazonIntegration: {
        mode: connectorMode,
        configured: amazonStatus.configured,
        missingFields: amazonStatus.missingFields,
        notes:
          connectorMode === "DEMO"
            ? "Operating in explicit DEMO mode. Real Amazon API credentials not provided or account flagged as demo."
            : "Live Amazon Ads API integration active.",
      },
      totalDurationMs: Date.now() - startTime,
    },
    {
      status: isHealthy ? 200 : 503,
    }
  );
}
