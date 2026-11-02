
import { SearchTermIntelligenceService } from "./search-term-intelligence.service";
import { SearchTermRecommendationService } from "./search-term-recommendation.service";
import { prisma } from "@/lib/prisma";
import { IngestionService } from "./ingestion.service";
import { executeRecommendation } from "@/lib/engines/execution";
import { JobStatus } from "@/generated/prisma/client";

export interface CycleResult {
  jobId: string;
  amazonAccountId: string;
  status: JobStatus;
  synced: boolean;
  analyzedKeywords: number;
  analyzedSearchTerms: number;
  recommendationsGenerated: number;
  autoExecuted: number;
  searchTermRecommendationsProcessed?: number;
  measured: boolean;
  durationMs: number;
  error?: string;
}

export class SchedulerWorkerService {
  private static readonly LOCK_TIMEOUT_MS = 5 * 60 * 1000;
  private static readonly MAX_RETRIES = 3;
  private static readonly MAX_AUTOMATIC_EXECUTIONS = 5;

  /**
   * Atomically claim an eligible job.
   *
   * PENDING jobs can run immediately.
   * RETRYING jobs can run only when their retry time has arrived.
   * RUNNING jobs can be reclaimed only when their lock has expired.
   * COMPLETED and FAILED jobs cannot be claimed.
   */
  static async acquireJobLock(
    jobId: string,
    workerId: string
  ): Promise<boolean> {
    const now = new Date();
    const expiredBefore = new Date(
      now.getTime() - this.LOCK_TIMEOUT_MS
    );

    const result = await prisma.syncJob.updateMany({
      where: {
        id: jobId,
        OR: [
          {
            status: "PENDING",
          },
          {
            status: "RETRYING",
            OR: [
              { nextRetryTime: null },
              { nextRetryTime: { lte: now } },
            ],
          },
          {
            status: "RUNNING",
            OR: [
              { lockedAt: null },
              { lockedAt: { lt: expiredBefore } },
            ],
          },
        ],
      },
      data: {
        status: "RUNNING",
        lockedAt: now,
        lockedBy: workerId,
      },
    });

    return result.count === 1;
  }

  /**
   * Return the existing hourly cycle when one already exists.
   */
  static async enqueueCycleJob(
    amazonAccountId: string
  ): Promise<string> {
    const hourKey = new Date().toISOString().slice(0, 13);
    const idempotencyKey = `cycle-${amazonAccountId}-${hourKey}`;

    const existing = await prisma.syncJob.findFirst({
      where: { idempotencyKey },
      select: { id: true },
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
   * Full cycle:
   * SYNC -> ANALYZE -> RECOMMEND -> AUTHORIZE
   * -> EXECUTE -> VERIFY -> MEASURE
   */
  
static async runAutopilotCycle(
  amazonAccountId: string,
  existingJobId?: string
): Promise<CycleResult> {
    const startTime = Date.now();
    const workerId = `worker-${crypto.randomUUID()}`;
    const jobId =
      existingJobId ?? await this.enqueueCycleJob(amazonAccountId);

    const acquired = await this.acquireJobLock(jobId, workerId);

    if (!acquired) {
      const existingJob = await prisma.syncJob.findUnique({
        where: { id: jobId },
        select: { status: true, nextRetryTime: true },
      });

      const status: JobStatus =
        existingJob?.status ?? "PENDING";

      let message = "Job is already running or is not yet eligible.";

      if (status === "COMPLETED") {
        message = "This hourly autopilot cycle has already completed.";
      } else if (status === "FAILED") {
        message = "This hourly autopilot cycle has permanently failed.";
      } else if (
        status === "RETRYING" &&
        existingJob?.nextRetryTime &&
        existingJob.nextRetryTime > new Date()
      ) {
        message = "The next retry is not due yet.";
      }

      return {
        jobId,
        amazonAccountId,
        status,
        synced: false,
        analyzedKeywords: 0,
        analyzedSearchTerms: 0,
        recommendationsGenerated: 0,
        autoExecuted: 0,
        measured: false,
        durationMs: Date.now() - startTime,
        error: message,
      };
    }

    try {
      // Validate the account before attempting synchronization.
      const accountExists = await prisma.amazonAccount.findUnique({
        where: { id: amazonAccountId },
        select: { id: true },
      });

      if (!accountExists) {
        throw new Error(`Account ${amazonAccountId} not found.`);
      }

      // STEP 1: SYNC
      const syncResult = await IngestionService.syncAccountData({
        amazonAccountId,
      });

      if (!syncResult.success) {
        throw new Error(
          "Amazon account synchronization failed. The cycle cannot continue using stale data."
        );
      }
      
      // STEP 2: CLASSIFY SEARCH TERMS
      const classifiedSearchTerms =
        await SearchTermIntelligenceService.analyzeAccount(
          amazonAccountId
        );

      // STEP 3: GENERATE DEDUPLICATED, APPROVAL-REQUIRED
      // SEARCH-TERM RECOMMENDATIONS FOR EACH ACCOUNT PRODUCT.
      const products = await prisma.product.findMany({
        where: { amazonAccountId },
        select: { id: true },
      });

      let searchTermRecommendationsProcessed = 0;

      for (const product of products) {
        const persistedRecommendations =
          await SearchTermRecommendationService.generateForProduct(
            amazonAccountId,
            product.id
          );

        searchTermRecommendationsProcessed +=
          persistedRecommendations.length;
      }

      console.info("Search-term intelligence completed", {
        amazonAccountId,
        classifiedSearchTerms: classifiedSearchTerms.length,
        productsAnalyzed: products.length,
        searchTermRecommendationsProcessed,
      });


      // Load campaign data AFTER synchronization.
      const account = await prisma.amazonAccount.findUnique({
        where: { id: amazonAccountId },
        include: {
          campaigns: {
            include: {
              keywords: true,
              searchTerms: true,
            },
          },
        },
      });

      if (!account) {
        throw new Error(`Account ${amazonAccountId} not found after sync.`);
      }

      // STEP 2 & 3: ANALYZE AND RECOMMEND
      let analyzedKeywords = 0;
      let analyzedSearchTerms = 0;
      let recommendationsGenerated = 0;

      for (const campaign of account.campaigns) {
        analyzedSearchTerms += campaign.searchTerms.length;

        for (const keyword of campaign.keywords) {
          analyzedKeywords++;

          // Existing conservative opportunity rule.
          if (
            keyword.clicks < 15 ||
            keyword.orders < 3 ||
            keyword.acos >= 0.22
          ) {
            continue;
          }

          const existing = await prisma.recommendation.findFirst({
            where: {
              keywordId: keyword.id,
              status: "PENDING",
            },
            select: { id: true },
          });

          if (existing) {
            continue;
          }

          const recommendedBid = Number(
            (keyword.bid * 1.08).toFixed(2)
          );

          await prisma.recommendation.create({
            data: {
              amazonAccountId: account.id,
              campaignId: campaign.id,
              keywordId: keyword.id,
              actionType: "INCREASE_BID",
              title: `Optimize bid for "${keyword.value}"`,
              description:
                "High-performing keyword converting below target ACoS.",
              reason: `${keyword.orders} orders with ${(keyword.acos * 100).toFixed(1)}% ACoS.`,
              currentValue: keyword.bid,
              recommendedValue: recommendedBid,
              changePercent: 8,
              expectedImpact:
                "Capture more high-intent conversion traffic.",
              confidence: 0.88,
              risk: "LOW",
              status: "PENDING",
              approvalStatus: "PENDING",
              requiresApproval: account.automationLevel < 3,
            },
          });

          recommendationsGenerated++;
        }
      }

      // STEP 4, 5 & 6: AUTHORIZE, EXECUTE AND VERIFY
      // The execution engine remains responsible for authorization,
      // bid-change limits, execution verification and audit logging.
      let autoExecuted = 0;

      if (
        account.automationLevel >= 3 &&
        !account.automationPaused
      ) {
        const pendingBidRecommendations =
          await prisma.recommendation.findMany({
            where: {
              amazonAccountId: account.id,
              status: "PENDING",
              actionType: {
                in: ["INCREASE_BID", "DECREASE_BID"],
              },
            },
            take: this.MAX_AUTOMATIC_EXECUTIONS,
          });

        for (const recommendation of pendingBidRecommendations) {
          try {
            const result = await executeRecommendation({
              recommendationId: recommendation.id,
              approvalSource: "AUTOPILOT_POLICY",
              actor: "AUTOPILOT_SCHEDULER",
            });

            if (result.success) {
              autoExecuted++;
            }
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : String(error);

            console.warn(
              `Autopilot skipped recommendation ${recommendation.id}:`,
              message
            );
          }
        }
      }

      // STEP 7: MEASURE
      const durationMs = Date.now() - startTime;

      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          lockedAt: null,
          lockedBy: null,
          nextRetryTime: null,
          error: null,
          result: JSON.stringify({
            synced: syncResult.success,
            analyzedKeywords,
            analyzedSearchTerms,
            recommendationsGenerated,
            searchTermRecommendationsProcessed,
            autoExecuted,
            durationMs,
          }),
        },
      });

      return {
        jobId,
        amazonAccountId,
        status: "COMPLETED",
        synced: true,
        analyzedKeywords,
        analyzedSearchTerms,
        recommendationsGenerated,
        autoExecuted,
        measured: true,
        durationMs,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error);

      const job = await prisma.syncJob.findUnique({
        where: { id: jobId },
        select: { retryCount: true },
      });

      const currentRetries = job?.retryCount ?? 0;
      const exhaustedRetries =
        currentRetries >= this.MAX_RETRIES;

      const nextRetryTime = exhaustedRetries
        ? null
        : new Date(
            Date.now() +
              Math.pow(2, currentRetries) * 60 * 1000
          );

      const finalStatus: JobStatus = exhaustedRetries
        ? "FAILED"
        : "RETRYING";

      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: finalStatus,
          retryCount: currentRetries + 1,
          nextRetryTime,
          error: errorMessage,
          lockedAt: null,
          lockedBy: null,
        },
      });

      return {
        jobId,
        amazonAccountId,
        status: finalStatus,
        synced: false,
        analyzedKeywords: 0,
        analyzedSearchTerms: 0,
        recommendationsGenerated: 0,
        autoExecuted: 0,
        measured: false,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }
}
