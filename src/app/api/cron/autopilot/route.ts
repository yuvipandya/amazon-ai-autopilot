
import { NextResponse } from "next/server";
import { SchedulerWorkerService } from "@/lib/services/scheduler";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized cron request" },
      { status: 401 }
    );
  }

  try {
    const organizationId = process.env.AUTOPILOT_ORGANIZATION_ID;

    // Fail closed rather than accidentally processing every organization.
    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "AUTOPILOT_ORGANIZATION_ID is not configured.",
        },
        { status: 500 }
      );
    }

    const accounts = await prisma.amazonAccount.findMany({
      where: {
        status: "ACTIVE",
        organizationId,
      },
      select: { id: true },
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        processedAccounts: 0,
        retriedJobs: 0,
        results: [],
      });
    }

    const accountIds = accounts.map((account) => account.id);
    const now = new Date();

    // Find unresolved retries so a new hourly cycle cannot bypass backoff.
    const retryJobs = await prisma.syncJob.findMany({
      where: {
        type: "AUTOPILOT_CYCLE",
        status: "RETRYING",
        amazonAccountId: { in: accountIds },
      },
      orderBy: { nextRetryTime: "asc" },
      select: {
        id: true,
        amazonAccountId: true,
        nextRetryTime: true,
      },
    });

    const accountsWithRetries = new Set(
      retryJobs.map((job) => job.amazonAccountId)
    );

    const dueRetries = retryJobs
      .filter(
        (job) =>
          job.nextRetryTime === null ||
          job.nextRetryTime <= now
      )
      .slice(0, 20);

    const results = [];
    let retriedJobs = 0;

    // Retry the original job, preserving its retry count and identity.
    for (const job of dueRetries) {
      const result = await SchedulerWorkerService.runAutopilotCycle(
        job.amazonAccountId,
        job.id
      );

      results.push(result);
      retriedJobs++;
    }

    // Never start another cycle for an account that had an unresolved
    // retry when this cron invocation began. This prevents backoff bypass
    // and duplicate work in the same invocation.
    const accountsEligibleForNewCycles = accounts.filter(
      (account) => !accountsWithRetries.has(account.id)
    );

    for (const account of accountsEligibleForNewCycles) {
      const result =
        await SchedulerWorkerService.runAutopilotCycle(account.id);

      results.push(result);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      processedAccounts: accounts.length,
      retriedJobs,
      skippedAccountsWithRetries:
        accountsWithRetries.size,
      results,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error("Autopilot cron failed:", message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
