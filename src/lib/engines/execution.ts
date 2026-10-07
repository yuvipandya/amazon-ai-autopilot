import { prisma } from "@/lib/prisma";
import { getAmazonConnector } from "@/lib/amazon/connector-factory";
import { authorizeExecution } from "./authorization";
import { ApprovalSource, ExecutionState } from "@/generated/prisma/client";

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

export async function executeRecommendation(
  input: ExecuteInput
): Promise<ExecutionResult> {
  const approvalSource = input.approvalSource ?? "HUMAN_APPROVAL";

  // 1. Fetch recommendation with full context
  const recommendation = await prisma.recommendation.findUnique({
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

  if (recommendation.status !== "PENDING") {
    throw new Error(`Recommendation is already ${recommendation.status}.`);
  }

  const account = recommendation.amazonAccount;

  // 2. Authorize via Single Server-Side Authorization Boundary
  const auth = await authorizeExecution({
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
    entityType: recommendation.keywordId ? "keyword" : recommendation.campaignId ? "campaign" : undefined,
    entityId: recommendation.keywordId ?? recommendation.campaignId ?? undefined,
  });

  if (!auth.authorized) {
    throw new Error(`Authorization boundary rejected execution: ${auth.reason}`);
  }

  // 3. Obtain connector (Real or Mock)
  const { connector, mode } = getAmazonConnector(account);

  // 4. Mark state as SUBMITTED before initiating write
  await prisma.recommendation.update({
    where: { id: recommendation.id },
    data: {
      executionState: "SUBMITTED",
      connectorMode: mode,
    },
  });

  let entityType = "";
  let entityId = "";
  let previousValue: number | null = null;
  let newValue: number | null = null;
  let beforeSnapshot: Record<string, unknown> = {};
  let afterSnapshot: Record<string, unknown> = {};
  let amazonRequestId = "";
  let writeMessage = "";

  const effectiveProfileId = account.profileId || "default-profile";

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

      // Execute write through Amazon Connector
      const writeRes = await connector.updateKeywordBid(effectiveProfileId, {
        keywordId: recommendation.keyword.amazonKeywordId || recommendation.keyword.id,
        newBid: newValue,
        previousBid: previousValue,
      });

      amazonRequestId = writeRes.metadata.requestId;

      if (!writeRes.success) {
        throw new Error(`Amazon write failed: ${writeRes.error}`);
      }

      // POST-WRITE READ-BACK VERIFICATION
      const verification = await connector.verifyKeywordBid(
        effectiveProfileId,
        recommendation.keyword.amazonKeywordId || recommendation.keyword.id,
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
        verifiedAmazonValue: verification.actualAmazonValue,
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

      const writeRes = await connector.updateCampaignBudget(effectiveProfileId, {
        campaignId: recommendation.campaign.amazonCampaignId || recommendation.campaign.id,
        newBudget: newValue,
        previousBudget: previousValue,
      });

      amazonRequestId = writeRes.metadata.requestId;

      if (!writeRes.success) {
        throw new Error(`Amazon write failed: ${writeRes.error}`);
      }

      const verification = await connector.verifyCampaignBudget(
        effectiveProfileId,
        recommendation.campaign.amazonCampaignId || recommendation.campaign.id,
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
        verifiedAmazonValue: verification.actualAmazonValue,
      };
    }

    // ----------------------------------------------------
    // ADD NEGATIVE KEYWORD
    // ----------------------------------------------------
    else if (recommendation.actionType === "ADD_NEGATIVE_KEYWORD") {
      if (!recommendation.searchTerm || !recommendation.campaign) {
        throw new Error("Target search term or campaign not found.");
      }

      entityType = "search_term";
      entityId = recommendation.searchTerm.id;

      beforeSnapshot = {
        searchTermId: recommendation.searchTerm.id,
        value: recommendation.searchTerm.value,
        classification: recommendation.searchTerm.classification,
      };

      const writeRes = await connector.createNegativeKeyword(effectiveProfileId, {
        campaignId: recommendation.campaign.amazonCampaignId || recommendation.campaign.id,
        keywordText: recommendation.searchTerm.value,
        matchType: "NEGATIVE_EXACT",
      });

      amazonRequestId = writeRes.metadata.requestId;

      if (!writeRes.success) {
        throw new Error(`Amazon write failed: ${writeRes.error}`);
      }

      writeMessage =
        mode === "REAL"
          ? `Amazon Ads API created negative exact keyword "${recommendation.searchTerm.value}" (Req: ${amazonRequestId}).`
          : `Mock Amazon Ads API added "${recommendation.searchTerm.value}" as a negative exact keyword (MockReq: ${amazonRequestId}).`;

      afterSnapshot = {
        ...beforeSnapshot,
        negativeStatus: "CREATED",
        amazonKeywordId: writeRes.data?.keywordId,
      };
    }

    // ----------------------------------------------------
    // HARVEST KEYWORD
    // ----------------------------------------------------
    else if (recommendation.actionType === "HARVEST_KEYWORD") {
      if (!recommendation.searchTerm || !recommendation.campaign) {
        throw new Error("Target search term or campaign not found.");
      }

      entityType = "search_term";
      entityId = recommendation.searchTerm.id;
      const suggestedBid = recommendation.recommendedValue ?? 10;
      newValue = suggestedBid;

      beforeSnapshot = {
        searchTermId: recommendation.searchTerm.id,
        value: recommendation.searchTerm.value,
        classification: recommendation.searchTerm.classification,
      };

      const writeRes = await connector.createKeyword(effectiveProfileId, {
        campaignId: recommendation.campaign.amazonCampaignId || recommendation.campaign.id,
        keywordText: recommendation.searchTerm.value,
        matchType: "EXACT",
        bid: suggestedBid,
      });

      amazonRequestId = writeRes.metadata.requestId;

      if (!writeRes.success) {
        throw new Error(`Amazon write failed: ${writeRes.error}`);
      }

      writeMessage =
        mode === "REAL"
          ? `Amazon Ads API harvested "${recommendation.searchTerm.value}" as exact keyword at ₹${suggestedBid} (Req: ${amazonRequestId}).`
          : `Mock Amazon Ads API harvested "${recommendation.searchTerm.value}" into campaign as exact keyword (MockReq: ${amazonRequestId}).`;

      afterSnapshot = {
        ...beforeSnapshot,
        harvestedBid: suggestedBid,
        amazonKeywordId: writeRes.data?.keywordId,
      };
    } else {
      throw new Error(`Unsupported action: ${recommendation.actionType}`);
    }

    // 5. Database State Synchronization in Transaction after Verified Success
    const verifiedTimestamp = new Date();

    return await prisma.$transaction(async (tx) => {
      // Update local entity if applicable
      if (entityType === "keyword" && newValue !== null) {
        await tx.keyword.update({
          where: { id: recommendation.keyword!.id },
          data: { bid: newValue },
        });
      } else if (entityType === "campaign" && newValue !== null) {
        await tx.campaign.update({
          where: { id: recommendation.campaign!.id },
          data: { dailyBudget: newValue },
        });
      } else if (recommendation.actionType === "ADD_NEGATIVE_KEYWORD") {
        await tx.keyword.upsert({
          where: {
            campaignId_value_matchType: {
              campaignId: recommendation.campaign!.id,
              value: recommendation.searchTerm!.value,
              matchType: "NEGATIVE_EXACT",
            },
          },
          update: { status: "NEGATIVE" },
          create: {
            campaignId: recommendation.campaign!.id,
            value: recommendation.searchTerm!.value,
            matchType: "NEGATIVE_EXACT",
            bid: 0,
            status: "NEGATIVE",
          },
        });
      } else if (recommendation.actionType === "HARVEST_KEYWORD" && newValue !== null) {
        await tx.keyword.upsert({
          where: {
            campaignId_value_matchType: {
              campaignId: recommendation.campaign!.id,
              value: recommendation.searchTerm!.value,
              matchType: "EXACT",
            },
          },
          update: { status: "ACTIVE", bid: newValue },
          create: {
            campaignId: recommendation.campaign!.id,
            value: recommendation.searchTerm!.value,
            matchType: "EXACT",
            bid: newValue,
            status: "ACTIVE",
          },
        });
      }

      // Mark recommendation as VERIFIED_SUCCESS
      await tx.recommendation.update({
        where: { id: recommendation.id },
        data: {
          status: "EXECUTED",
          executionState: "VERIFIED_SUCCESS",
          approvalStatus: "APPROVED",
          approvalSource,
          approvalActor: input.actor || (approvalSource === "HUMAN_APPROVAL" ? "seller" : "autopilot"),
          approvalTimestamp: verifiedTimestamp,
          executedAt: verifiedTimestamp,
          verifiedAt: verifiedTimestamp,
          amazonRequestId,
          connectorMode: mode,
          beforeSnapshot: JSON.stringify(beforeSnapshot),
          afterSnapshot: JSON.stringify(afterSnapshot),
        },
      });

      // Audit Log with full traceability
      await tx.auditLog.create({
        data: {
          amazonAccountId: recommendation.amazonAccountId,
          recommendationId: recommendation.id,
          entityType,
          entityId,
          action: recommendation.actionType,
          previousValue: previousValue !== null ? String(previousValue) : null,
          newValue: newValue !== null ? String(newValue) : null,
          reason: recommendation.reason,
          aiModel: "deterministic-engine-v2",
          promptVersion: "not-applicable",
          strategyVersion: mode === "REAL" ? "production-v1" : "demo-v1",
          confidence: recommendation.confidence,
          approvalStatus: "APPROVED",
          executionResult: "SUCCESS",
          amazonRequestId,
          connectorMode: mode,
          rawResponse: JSON.stringify({
            connector: mode === "REAL" ? "RealAmazonConnector" : "MockAmazonConnector",
            mode,
            requestId: amazonRequestId,
            verified: true,
            message: writeMessage,
          }),
          rollbackInfo:
            previousValue !== null
              ? JSON.stringify({
                  available: true,
                  previousValue,
                  snapshot: beforeSnapshot,
                  connectorMode: mode,
                })
              : JSON.stringify({ available: false }),
        },
      });

      return {
        success: true,
        action: recommendation.actionType,
        entityType,
        entityId,
        executionState: "VERIFIED_SUCCESS",
        connectorMode: mode,
        amazonRequestId,
        previousValue,
        newValue,
        message: writeMessage,
        verifiedAt: verifiedTimestamp.toISOString(),
      };
    });
  } catch (err: any) {
    // Record failure in state machine
    await prisma.recommendation.update({
      where: { id: recommendation.id },
      data: {
        executionState: "FAILED",
        executionError: err.message,
      },
    });

    throw err;
  }
}