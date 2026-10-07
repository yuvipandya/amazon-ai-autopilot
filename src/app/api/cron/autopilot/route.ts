import { NextResponse } from "next/server";
import { SchedulerWorkerService } from "@/lib/services/scheduler";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Optional bearer token check if CRON_SECRET is configured
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
    }

    const accounts = await prisma.amazonAccount.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, sellerName: true },
    });

    const results = [];
    for (const acc of accounts) {
      const res = await SchedulerWorkerService.runAutopilotCycle(acc.id);
      results.push(res);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      processedAccounts: results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Allow GET for simple HTTP cron pings (e.g., Railway/cron-job.org)
export async function GET(request: Request) {
  return POST(request);
}
