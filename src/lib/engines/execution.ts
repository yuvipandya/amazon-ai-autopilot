import { prisma } from "@/lib/prisma";
import { getAmazonConnector } from "@/lib/amazon/connector-factory";
import { validateRecommendation } from "./validation";
import { authorizeExecution } from "./authorization";
import type { ApprovalSource, ExecutionState } from "@/lib/amazon/types";

export type ExecuteInput = {
  recommendationId: string;
  approvalSource?: ApprovalSource;
  actor?: string;
  idempotencyKey?: string;
};

export type ExecutionResult = {
  success: boolean;
  action: string;
  entityType: string;
  entityId: string;
  executionState: ExecutionState;
  connectorMode: "DEMO" | "REAL";
  amazonRequestId: string;
  previousValue: number | null;
  newValue: number | null;
  message: string;
  verifiedAt?: string;
};

export type ExecutionDependencies = {
  db?: typeof prisma;
  connectorFactory?: typeof getAmazonConnector;
  validate?: typeof validateRecommendation;
  authorize?: typeof authorizeExecution;
};

export async function executeRecommendation(
  input: ExecuteInput,
  dependencies: ExecutionDependencies = {}
): Promise<ExecutionResult> {
  const db = dependencies.db ?? prisma;
  const connectorFactory = dependencies.connectorFactory ?? getAmazonConnector;
  const validate = dependencies.validate ?? validateRecommendation;
  const authorize = dependencies.authorize ?? authorizeExecution;
  const approvalSource = input.approvalSource ?? "HUMAN_APPROVAL";

  // 1. Fetch recommendation with full context
  const recommendation = await db.recommendation.findUnique({
    where: {
      id: input.recommendationId,
    },
    include: {
      amazonAccount: true,
      keyword: true,
      campaign: true,
      searchTerm: true,
    },
  });

  if (!recommendation) {
    throw new Error("Recommendation not found.");
  }

  const statusAllowed =
    approvalSource === "AUTOPILOT_POLICY"
      ? recommendation.status === "PENDING"
      : recommendation.status === "APPROVED";

  if (!statusAllowed) {
    throw new Error(
      approvalSource === "AUTOPILOT_POLICY"
        ? `Autonomous execution requires a PENDING recommendation. Current status: ${recommendation.status}.`
        : `Human execution requires an APPROVED recommendation. Current status: ${recommendation.status}.`
    );
  }

  // 2. Mandatory deterministic validation boundary.
  // Every execution caller — human, scheduler, or future API — must
  // pass the same recommendation validation before any authorization
  // or Amazon write can occur.
  const validation = await validate(recommendation);

  if (!validation.passed) {
    throw new Error(
      `Recommendation validation rejected execution: ${validation.reason}`
    );
  }

  const account = recommendation.amazonAccount;

  // 3. Authorize via Single Server-Side Authorization Boundary
  const auth = await authorize({
    organizationId: account.organizationId,
    amazonAccountId: account.id,
    recommendationId: recommendation.id,
    actionType: recommendation.actionType,
    risk: recommendation.risk,
    approvalSource,
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    currentValue: recommendation.currentValue,
    recommendedValue: recommendation.recommendedValue,
    changePercent: recommendation.changePercent,
    entityType: recommendation.keywordId
      ? "keyword"
      : recommendation.campaignId
        ? "campaign"
        : undefined,
    entityId:
      recommendation.keywordId ??
      recommendation.campaignId ??
      undefined,
  });

  if (!auth.authorized) {
    throw new Error(
      `Authorization boundary rejected execution: ${auth.reason}`
    );
  }

  // 4. Obtain connector (Real or Mock)
  const { connector, mode, diagnostic } = connectorFactory(account);

  // A live account must never "execute" against the mock connector: the
  // local database would be updated while Amazon is untouched.
  if (account.isLiveAccount && mode !== "REAL") {
    throw new Error(
      `Live Amazon account cannot execute in ${mode} mode. Missing configuration: ${
        diagnostic?.missingFields?.join(", ") || "unknown"
      }.`
    );
  }

  // 5. Atomically claim the recommendation before any Amazon write.
  // Only one concurrent caller can transition an eligible PENDING record.
  const claim = await db.recommendation.updateMany({
    where: {
      id: recommendation.id,
      status: approvalSource === "AUTOPILOT_POLICY" ? "PENDING" : "APPROVED",
      executionState: "PENDING",
    },
    data: {
      executionState: "SUBMITTED",
      connectorMode: mode,
    },
  });

  if (claim.count !== 1) {
    throw new Error(
      "Execution claim rejected: recommendation is no longer eligible or is already being processed."
    );
  }

  let entityType = "";
  let entityId = "";
  let previousValue: number | null = null;
  let newValue: number | null = null;
  let beforeSnapshot: Record<string, unknown> = {};
  let afterSnapshot: Record<string, unknown> = {};
  let amazonRequestId = "";
  let writeMessage = "";

  const effectiveProfileId =
    account.profileId || "default-profile";

  let writeAttempted = false;

  try {
    // ----------------------------------------------------
    // BID CHANGE
    // ----------------------------------------------------
    if (
      recommendation.actionType === "INCREASE_BID" ||
      recommendation.actionType === "DECREASE_BID"
    ) {
      if (!recommendation.keyword) {
        throw new Error("Target keyword not found.");
      }

      if (recommendation.recommendedValue === null) {
        throw new Error("Recommended bid is missing.");
      }

      entityType = "keyword";
      entityId = recommendation.keyword.id;
      previousValue = recommendation.keyword.bid;
      newValue = recommendation.recommendedValue;

      beforeSnapshot = {
        keywordId: recommendation.keyword.id,
        value: recommendation.keyword.value,
        matchType: recommendation.keyword.matchType,
        bid: previousValue,
        campaignId: recommendation.keyword.campaignId,
      };

      writeAttempted = true;
      const writeRes = await connector.updateKeywordBid(
        effectiveProfileId,
        {
          keywordId:
            recommendation.keyword.amazonKeywordId ||
            recommendation.keyword.id,
          newBid: newValue,
          previousBid: previousValue,
        }
      );

      amazonRequestId = writeRes.metadata.requestId;

      if (!writeRes.success) {
        throw new Error(
          `Amazon write failed: ${writeRes.error}`
        );
      }

      const verification =
        await connector.verifyKeywordBid(
          effectiveProfileId,
          recommendation.keyword.amazonKeywordId ||
            recommendation.keyword.id,
          newValue
        );

      if (!verification.verified) {
        throw new Error(
          `Amazon post-write verification failed: ${verification.message}`
        );
      }

      writeMessage =
        mode === "REAL"
          ? `Amazon Ads API verified keyword bid updated from ₹${previousValue.toFixed(2)} to ₹${newValue.toFixed(2)} (Req: ${amazonRequestId}).`
          : `Mock Amazon Ads API verified keyword bid from ₹${previousValue.toFixed(2)} to ₹${newValue.toFixed(2)} (MockReq: ${amazonRequestId}).`;

      afterSnapshot = {
        ...beforeSnapshot,
        bid: newValue,
        verifiedAmazonValue:
          verification.actualAmazonValue,
      };
    }

    // ----------------------------------------------------
    // BUDGET CHANGE
    // ----------------------------------------------------
    else if (
      recommendation.actionType === "INCREASE_BUDGET" ||
      recommendation.actionType === "DECREASE_BUDGET"
    ) {
      if (!recommendation.campaign) {
        throw new Error("Target campaign not found.");
      }

      if (recommendation.recommendedValue === null) {
        throw new Error("Recommended budget is missing.");
      }

      entityType = "campaign";
      entityId = recommendation.campaign.id;
      previousValue = recommendation.campaign.dailyBudget;
      newValue = recommendation.recommendedValue;

      beforeSnapshot = {
        campaignId: recommendation.campaign.id,
        name: recommendation.campaign.name,
        dailyBudget: previousValue,
      };

      writeAttempted = true;
      const writeRes =
        await connector.updateCampaignBudget(
          effectiveProfileId,
          {
            campaignId:
              recommendation.campaign.amazonCampaignId ||
              recommendation.campaign.id,
            newBudget: newValue,
            previousBudget: previousValue,
          }
        );

      amazonRequestId = writeRes.metadata.requestId;

      if (!writeRes.success) {
        throw new Error(
          `Amazon write failed: ${writeRes.error}`
        );
      }

      const verification =
        await connector.verifyCampaignBudget(
          effectiveProfileId,
          recommendation.campaign.amazonCampaignId ||
            recommendation.campaign.id,
          newValue
        );

      if (!verification.verified) {
        throw new Error(
          `Amazon post-write verification failed: ${verification.message}`
        );
      }

      writeMessage =
        mode === "REAL"
          ? `Amazon Ads API verified campaign budget updated from ₹${previousValue.toFixed(2)} to ₹${newValue.toFixed(2)} (Req: ${amazonRequestId}).`
          : `Mock Amazon Ads API verified daily budget from ₹${previousValue.toFixed(2)} to ₹${newValue.toFixed(2)} (MockReq: ${amazonRequestId}).`;

      afterSnapshot = {
        ...beforeSnapshot,
        dailyBudget: newValue,
        verifiedAmazonValue:
          verification.actualAmazonValue,
      };
    }

    // ----------------------------------------------------
    // ADD NEGATIVE KEYWORD
    // ----------------------------------------------------
    else if (
      recommendation.actionType ===
      "ADD_NEGATIVE_KEYWORD"
    ) {
      if (
        !recommendation.searchTerm ||
        !recommendation.campaign
      ) {
        throw new Error(
          "Target search term or campaign not found."
        );
      }

      entityType = "search_term";
      entityId = recommendation.searchTerm.id;

      beforeSnapshot = {
        searchTermId: recommendation.searchTerm.id,
        value: recommendation.searchTerm.value,
        classification:
          recommendation.searchTerm.classification,
      };

      writeAttempted = true;
      const writeRes =
        await connector.createNegativeKeyword(
          effectiveProfileId,
          {
            campaignId:
              recommendation.campaign.amazonCampaignId ||
              recommendation.campaign.id,
            keywordText:
              recommendation.searchTerm.value,
            matchType: "NEGATIVE_EXACT",
          }
        );

      amazonRequestId = writeRes.metadata.requestId;

      if (!writeRes.success) {
        throw new Error(
          `Amazon write failed: ${writeRes.error}`
        );
      }

      writeMessage =
        mode === "REAL"
          ? `Amazon Ads API created negative exact keyword "${recommendation.searchTerm.value}" (Req: ${amazonRequestId}).`
          : `Mock Amazon Ads API added "${recommendation.searchTerm.value}" as a negative exact keyword (MockReq: ${amazonRequestId}).`;

      afterSnapshot = {
        ...beforeSnapshot,
        negativeStatus: "CREATED",
        amazonKeywordId:
          writeRes.data?.keywordId,
      };
    }

    // ----------------------------------------------------
    // HARVEST KEYWORD
    // ----------------------------------------------------
    else if (
      recommendation.actionType === "HARVEST_KEYWORD"
    ) {
      if (
        !recommendation.searchTerm ||
        !recommendation.campaign
      ) {
        throw new Error(
          "Target search term or campaign not found."
        );
      }

      entityType = "search_term";
      entityId = recommendation.searchTerm.id;

      const suggestedBid =
        recommendation.recommendedValue ?? 10;

      newValue = suggestedBid;

      const amazonCampaignId =
        recommendation.campaign.amazonCampaignId ||
        recommendation.campaign.id;

      beforeSnapshot = {
        searchTermId:
          recommendation.searchTerm.id,
        value:
          recommendation.searchTerm.value,
        classification:
          recommendation.searchTerm.classification,
        matchType: "EXACT",
        proposedBid: suggestedBid,
        campaignId: amazonCampaignId,
      };

      // Create keyword in Amazon.
      writeAttempted = true;
      const writeRes =
        await connector.createKeyword(
          effectiveProfileId,
          {
            campaignId: amazonCampaignId,
            keywordText:
              recommendation.searchTerm.value,
            matchType: "EXACT",
            bid: suggestedBid,
          }
        );

      // Preserve the CREATE request ID for auditability.
      amazonRequestId =
        writeRes.metadata.requestId;

      if (!writeRes.success) {
        throw new Error(
          `Amazon write failed: ${writeRes.error}`
        );
      }

      // Amazon must return the created keyword ID.
      const createdKeywordId =
        writeRes.data?.keywordId;

      if (!createdKeywordId) {
        throw new Error(
          "Amazon keyword creation succeeded but no keyword ID was returned."
        );
      }

      // POST-WRITE CREATION VERIFICATION.
      // Never mark the recommendation successful until
      // Amazon confirms the keyword exists correctly.
      const verification =
        await connector.verifyKeywordCreation(
          effectiveProfileId,
          {
            campaignId: amazonCampaignId,
            keywordId: createdKeywordId,
            keywordText:
              recommendation.searchTerm.value,
            matchType: "EXACT",
            expectedBid: suggestedBid,
          }
        );

      if (!verification.verified) {
        throw new Error(
          `Amazon keyword creation verification failed: ${verification.message}`
        );
      }

      writeMessage =
        mode === "REAL"
          ? `Amazon Ads API created and verified "${recommendation.searchTerm.value}" as an exact keyword at ₹${suggestedBid.toFixed(2)} (Req: ${amazonRequestId}).`
          : `Mock Amazon Ads API created and verified "${recommendation.searchTerm.value}" as an exact keyword at ₹${suggestedBid.toFixed(2)} (MockReq: ${amazonRequestId}).`;

      afterSnapshot = {
        ...beforeSnapshot,
        harvestedBid: suggestedBid,
        amazonKeywordId: createdKeywordId,
        verification: {
          verified: true,
          actualAmazonValue:
            verification.actualAmazonValue,
          verifiedAt: verification.verifiedAt,
        },
      };
    } else {
      throw new Error(
        `Unsupported action: ${recommendation.actionType}`
      );
    }

    // 6. Database State Synchronization in Transaction
    // after verified success.
    const verifiedTimestamp = new Date();

    return await db.$transaction(async (tx) => {
      // Update local keyword bid.
      if (
        entityType === "keyword" &&
        newValue !== null
      ) {
        await tx.keyword.update({
          where: {
            id: recommendation.keyword!.id,
          },
          data: {
            bid: newValue,
          },
        });
      }

      // Update local campaign budget.
      else if (
        entityType === "campaign" &&
        newValue !== null
      ) {
        await tx.campaign.update({
          where: {
            id: recommendation.campaign!.id,
          },
          data: {
            dailyBudget: newValue,
          },
        });
      }

      // Persist negative keyword.
      else if (
        recommendation.actionType ===
        "ADD_NEGATIVE_KEYWORD"
      ) {
        await tx.keyword.upsert({
          where: {
            campaignId_value_matchType: {
              campaignId:
                recommendation.campaign!.id,
              value:
                recommendation.searchTerm!.value,
              matchType: "NEGATIVE_EXACT",
            },
          },
          update: {
            status: "NEGATIVE",
          },
          create: {
            campaignId:
              recommendation.campaign!.id,
            amazonKeywordId:
              afterSnapshot.amazonKeywordId as
                | string
                | undefined,
            value:
              recommendation.searchTerm!.value,
            matchType: "NEGATIVE_EXACT",
            bid: 0,
            status: "NEGATIVE",
          },
        });
      }

      // Persist harvested keyword + Amazon keyword ID.
      else if (
        recommendation.actionType ===
          "HARVEST_KEYWORD" &&
        newValue !== null
      ) {
        const amazonKeywordId =
          afterSnapshot.amazonKeywordId;

        if (
          typeof amazonKeywordId !== "string" ||
          amazonKeywordId.length === 0
        ) {
          throw new Error(
            "Verified harvested keyword is missing its Amazon keyword ID."
          );
        }

        await tx.keyword.upsert({
          where: {
            campaignId_value_matchType: {
              campaignId:
                recommendation.campaign!.id,
              value:
                recommendation.searchTerm!.value,
              matchType: "EXACT",
            },
          },
          update: {
            amazonKeywordId,
            status: "ACTIVE",
            bid: newValue,
          },
          create: {
            campaignId:
              recommendation.campaign!.id,
            amazonKeywordId,
            value:
              recommendation.searchTerm!.value,
            matchType: "EXACT",
            bid: newValue,
            status: "ACTIVE",
          },
        });
      }

      // Mark recommendation VERIFIED_SUCCESS.
      await tx.recommendation.update({
        where: {
          id: recommendation.id,
        },
        data: {
          status: "EXECUTED",
          executionState: "VERIFIED_SUCCESS",
          approvalStatus: "APPROVED",
          approvalSource,
          approvalActor:
            input.actor ||
            (approvalSource === "HUMAN_APPROVAL"
              ? "seller"
              : "autopilot"),
          approvalTimestamp: verifiedTimestamp,
          executedAt: verifiedTimestamp,
          verifiedAt: verifiedTimestamp,
          amazonRequestId,
          connectorMode: mode,
          beforeSnapshot:
            JSON.stringify(beforeSnapshot),
          afterSnapshot:
            JSON.stringify(afterSnapshot),
        },
      });

      // Audit Log with full traceability.
      await tx.auditLog.create({
        data: {
          amazonAccountId:
            recommendation.amazonAccountId,
          recommendationId:
            recommendation.id,
          entityType,
          entityId,
          action:
            recommendation.actionType,
          previousValue:
            previousValue !== null
              ? String(previousValue)
              : null,
          newValue:
            newValue !== null
              ? String(newValue)
              : null,
          reason:
            recommendation.reason,
          aiModel:
            "deterministic-engine-v2",
          promptVersion:
            "not-applicable",
          strategyVersion:
            mode === "REAL"
              ? "production-v1"
              : "demo-v1",
          confidence:
            recommendation.confidence,
          approvalStatus:
            "APPROVED",
          executionResult:
            "SUCCESS",
          amazonRequestId,
          connectorMode: mode,
          rawResponse:
            JSON.stringify({
              connector:
                mode === "REAL"
                  ? "RealAmazonConnector"
                  : "MockAmazonConnector",
              mode,
              requestId:
                amazonRequestId,
              verified: true,
              message: writeMessage,
            }),
          rollbackInfo:
            previousValue !== null
              ? JSON.stringify({
                  available: true,
                  previousValue,
                  snapshot:
                    beforeSnapshot,
                  connectorMode: mode,
                })
              : JSON.stringify({
                  available: false,
                }),
        },
      });

      return {
        success: true,
        action:
          recommendation.actionType,
        entityType,
        entityId,
        executionState:
          "VERIFIED_SUCCESS",
        connectorMode: mode,
        amazonRequestId,
        previousValue,
        newValue,
        message: writeMessage,
        verifiedAt:
          verifiedTimestamp.toISOString(),
      };
    });
  } catch (err: unknown) {
    // After an external write is attempted, the outcome may be uncertain.
    await db.recommendation.update({
      where: {
        id: recommendation.id,
      },
      data: {
        executionState: writeAttempted ? "UNKNOWN" : "FAILED",
        executionError: String(err instanceof Error ? err.message : err).slice(0, 2000),
      },
    });

    throw err;
  }
}
