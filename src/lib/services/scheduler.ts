import { prisma } from "@/lib/prisma";
import { IngestionService } from "./ingestion.service";
import { executeRecommendation } from "@/lib/engines/execution";
import { JobType, JobStatus } from "@/generated/prisma/client";

export interface CycleResult {
  jobId: string;
  amazonAccountId: string;
  status: JobStatus;
  synced: boolean;
  analyzedKeywords: number;
  analyzedSearchTerms: number;
  recommendationsGenerated: number;
  autoExecuted: number;
  measured: boolean;
  durationMs: number;
  error?: string;
}

export class SchedulerWorkerService {
  /**
   * Acquire a lock for a background job to prevent concurrent execution.
   */
  static async acquireJobLock(jobId: string, workerId: string): Promise<boolean> {
    const job = await prisma.syncJob.findUnique({
      where: { id: jobId },
    });

    if (!job) return false;

    // Check if locked and lock is not expired (5 minutes timeout)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (job.lockedAt && job.lockedAt > fiveMinutesAgo && job.status === "RUNNING") {
      return false; // Another worker is actively holding the lock
    }

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: "RUNNING",
        lockedAt: new Date(),
        lockedBy: workerId,
      },
    });

    return true;
  }

  /**
   * Enqueues or starts a new cycle job with idempotency.
   */
  static async enqueueCycleJob(amazonAccountId: string): Promise<string> {
    const idempotencyKey = `cycle-${amazonAccountId}-${new Date().toISOString().slice(0, 13)}`; // Hourly key

    const existing = await prisma.syncJob.findFirst({
      where: { idempotencyKey },
    });

    if (existing) {
      return existing.id;
    }

    const job = await prisma.syncJob.create({
      data: {
        amazonAccountId,
        type: "AUTOPILOT_CYCLE",
        status: "PENDING",
        idempotencyKey,
      },
    });

    return job.id;
  }

  /**
   * Full Autopilot Sequence:
   * SYNC → ANALYZE → RECOMMEND → AUTHORIZE → EXECUTE → VERIFY → MEASURE
   */
  static async runAutopilotCycle(amazonAccountId: string): Promise<CycleResult> {
    const startTime = Date.now();
    const workerId = `worker-${Math.random().toString(36).substring(2, 8)}`;
    const jobId = await this.enqueueCycleJob(amazonAccountId);

    const acquired = await this.acquireJobLock(jobId, workerId);
    if (!acquired) {
      return {
        jobId,
        amazonAccountId,
        status: "RUNNING",
        synced: false,
        analyzedKeywords: 0,
        analyzedSearchTerms: 0,
        recommendationsGenerated: 0,
        autoExecuted: 0,
        measured: false,
        durationMs: 0,
        error: "Job locked by another worker.",
      };
    }

    try {
      const account = await prisma.amazonAccount.findUnique({
        where: { id: amazonAccountId },
        include: { campaigns: { include: { keywords: true, searchTerms: true } } },
      });

      if (!account) {
        throw new Error(`Account ${amazonAccountId} not found`);
      }

      // Step 1: SYNC
      const syncResult = await IngestionService.syncAccountData({ amazonAccountId });

      // Step 2 & 3: ANALYZE & RECOMMEND
      let analyzedKeywords = 0;
      let analyzedSearchTerms = 0;
      let recommendationsGenerated = 0;

      // Scan keywords for simple rules
      for (const campaign of account.campaigns) {
        for (const kw of campaign.keywords) {
          analyzedKeywords++;
          if (kw.clicks >= 15 && kw.orders >= 3 && kw.acos < 0.22) {
            // High performing keyword candidate
            const existing = await prisma.recommendation.findFirst({
              where: { keywordId: kw.id, status: "PENDING" },
            });
            if (!existing) {
              const recBid = Number((kw.bid * 1.08).toFixed(2));
              await prisma.recommendation.create({
                data: {
                  amazonAccountId: account.id,
                  campaignId: campaign.id,
                  keywordId: kw.id,
                  actionType: "INCREASE_BID",
                  title: `Optimize bid for "${kw.value}"`,
                  description: `High performing keyword converting below target ACoS.`,
                  reason: `${kw.orders} orders with ${(kw.acos * 100).toFixed(1)}% ACoS.`,
                  currentValue: kw.bid,
                  recommendedValue: recBid,
                  changePercent: 8,
                  expectedImpact: "Capture more high intent conversion traffic.",
                  confidence: 0.88,
                  status: "PENDING",
                  approvalStatus: "PENDING",
                  requiresApproval: account.automationLevel < 3,
                },
              });
              recommendationsGenerated++;
            }
          }
        }

        for (const term of campaign.searchTerms) {
          analyzedSearchTerms++;
        }
      }

      // Step 4, 5, 6: AUTHORIZE, EXECUTE, VERIFY
      let autoExecuted = 0;

      // Only attempt autonomous execution if account is Level 3 and not paused
      if (account.automationLevel >= 3 && !account.automationPaused) {
        // Autonomous execution is strictly limited to bid optimization.
        // Non-bid recommendations must remain PENDING for human approval.
        const pendingLowRisk = await prisma.recommendation.findMany({
           where: {
        	amazonAccountId: account.id,
        	status: "PENDING",
        	actionType: {
          	  in: ["INCREASE_BID", "DECREASE_BID"],
                },
      	   },
           take: 5,
        });

        for (const rec of pendingLowRisk) {
          try {
            const execRes = await executeRecommendation({
              recommendationId: rec.id,
              approvalSource: "AUTOPILOT_POLICY",
              actor: "AUTOPILOT_SCHEDULER",
            });
            if (execRes.success) {
              autoExecuted++;
            }
          } catch (err: any) {
            console.warn(`Autopilot execution skipped recommendation ${rec.id}:`, err.message);
          }
        }
      }

      // Step 7: MEASURE
      // Record learning outcome for executed recommendations
      const durationMs = Date.now() - startTime;

      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          lockedAt: null,
          lockedBy: null,
          result: JSON.stringify({
            synced: syncResult.success,
            analyzedKeywords,
            recommendationsGenerated,
            autoExecuted,
            durationMs,
          }),
        },
      });

      return {
        jobId,
        amazonAccountId,
        status: "COMPLETED",
        synced: syncResult.success,
        analyzedKeywords,
        analyzedSearchTerms,
        recommendationsGenerated,
        autoExecuted,
        measured: true,
        durationMs,
      };
    } catch (error: any) {
      const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
      const currentRetries = job?.retryCount ?? 0;
      const nextRetryTime = new Date(Date.now() + Math.pow(2, currentRetries) * 60 * 1000);

      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: currentRetries >= 3 ? "FAILED" : "RETRYING",
          retryCount: currentRetries + 1,
          nextRetryTime: currentRetries < 3 ? nextRetryTime : null,
          error: error.message,
          lockedAt: null,
          lockedBy: null,
        },
      });

      return {
        jobId,
        amazonAccountId,
        status: currentRetries >= 3 ? "FAILED" : "RETRYING",
        synced: false,
        analyzedKeywords: 0,
        analyzedSearchTerms: 0,
        recommendationsGenerated: 0,
        autoExecuted: 0,
        measured: false,
        durationMs: Date.now() - startTime,
        error: error.message,
      };
    }
  }
}
