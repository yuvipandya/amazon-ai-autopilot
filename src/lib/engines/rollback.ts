import { prisma } from "@/lib/prisma";
import { getAmazonConnector } from "@/lib/amazon/connector-factory";

export type RollbackInput = {
  recommendationId: string;
};

export type RollbackResult = {
  success: boolean;
  action: "ROLLBACK";
  entityType: string;
  entityId: string;
  connectorMode: "DEMO" | "REAL";
  amazonRequestId: string;
  previousValue: number;
  restoredValue: number;
  message: string;
};

export async function rollbackRecommendation(
  input: RollbackInput
): Promise<RollbackResult> {
  const originalAudit = await prisma.auditLog.findFirst({
    where: {
      recommendationId: input.recommendationId,
      executionResult: "SUCCESS",
      NOT: {
        action: "ROLLBACK",
      },
    },
    include: {
      amazonAccount: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!originalAudit) {
    throw new Error(
      "No successful execution with rollback information was found."
    );
  }

  if (!originalAudit.rollbackInfo) {
    throw new Error(
      "This execution does not contain rollback information."
    );
  }

  let rollbackInfo: {
    available?: boolean;
    previousValue?: number;
    snapshot?: Record<string, unknown>;
  };

  try {
    rollbackInfo = JSON.parse(originalAudit.rollbackInfo);
  } catch {
    throw new Error("Rollback information is invalid.");
  }

  if (
    rollbackInfo.available !== true ||
    rollbackInfo.previousValue === undefined
  ) {
    throw new Error("Rollback is not available for this execution.");
  }

  const restoredValue = Number(rollbackInfo.previousValue);

  if (!Number.isFinite(restoredValue)) {
    throw new Error("Rollback value is invalid.");
  }

  const account = originalAudit.amazonAccount;

  // Defense-in-depth kill switch.
  // Rollback is a write operation and must never bypass the account-level
  // automation pause, even when called directly outside the API route.
  if (account.automationPaused) {
    throw new Error(
      "Automation is paused. Rollback execution is blocked by the kill switch."
    );
  }

  const { connector, mode } = getAmazonConnector(account);
  const effectiveProfileId = account.profileId || "default-profile";

  let currentValue: number | null = null;
  const entityType = originalAudit.entityType;
  const entityId = originalAudit.entityId;
  let amazonRequestId = "";
  let rollbackMessage = "";

  // 1. Verify entity exists in DB and state hasn't drifted
  if (entityType === "keyword") {
    const keyword = await prisma.keyword.findUnique({
      where: { id: entityId },
    });

    if (!keyword) {
      throw new Error("Rollback target keyword no longer exists.");
    }

    currentValue = keyword.bid;

    if (
      originalAudit.newValue !== null &&
      Math.abs(currentValue - Number(originalAudit.newValue)) > 0.001
    ) {
      throw new Error(
        `Rollback stopped: current keyword bid is ₹${currentValue.toFixed(
          2
        )}, but executed value was ₹${Number(originalAudit.newValue).toFixed(
          2
        )}. Value has drifted since execution.`
      );
    }

    // Submit rollback write to Amazon Connector
    const writeRes = await connector.updateKeywordBid(effectiveProfileId, {
      keywordId: keyword.amazonKeywordId || keyword.id,
      newBid: restoredValue,
      previousBid: currentValue,
    });

    amazonRequestId = writeRes.metadata.requestId;

    if (!writeRes.success) {
      throw new Error(`Amazon rollback write failed: ${writeRes.error}`);
    }

    // Read Amazon value back (verification)
    const verification = await connector.verifyKeywordBid(
      effectiveProfileId,
      keyword.amazonKeywordId || keyword.id,
      restoredValue
    );

    if (!verification.verified) {
      throw new Error(
        `Amazon post-rollback verification failed: ${verification.message}`
      );
    }

    rollbackMessage =
      mode === "REAL"
        ? `[LIVE AMAZON ROLLBACK] Verified keyword bid restored to ₹${restoredValue.toFixed(2)} (Req: ${amazonRequestId}).`
        : `[DEMO ROLLBACK] Mock Amazon verified keyword bid restored to ₹${restoredValue.toFixed(2)} (MockReq: ${amazonRequestId}).`;
  } else if (entityType === "campaign") {
    const campaign = await prisma.campaign.findUnique({
      where: { id: entityId },
    });

    if (!campaign) {
      throw new Error("Rollback target campaign no longer exists.");
    }

    currentValue = campaign.dailyBudget;

    if (
      originalAudit.newValue !== null &&
      Math.abs(currentValue - Number(originalAudit.newValue)) > 0.001
    ) {
      throw new Error(
        `Rollback stopped: current campaign budget is ₹${currentValue.toFixed(
          2
        )}, but executed value was ₹${Number(originalAudit.newValue).toFixed(
          2
        )}. Value has drifted since execution.`
      );
    }

    const writeRes = await connector.updateCampaignBudget(effectiveProfileId, {
      campaignId: campaign.amazonCampaignId || campaign.id,
      newBudget: restoredValue,
      previousBudget: currentValue,
    });

    amazonRequestId = writeRes.metadata.requestId;

    if (!writeRes.success) {
      throw new Error(`Amazon rollback write failed: ${writeRes.error}`);
    }

    const verification = await connector.verifyCampaignBudget(
      effectiveProfileId,
      campaign.amazonCampaignId || campaign.id,
      restoredValue
    );

    if (!verification.verified) {
      throw new Error(
        `Amazon post-rollback verification failed: ${verification.message}`
      );
    }

    rollbackMessage =
      mode === "REAL"
        ? `[LIVE AMAZON ROLLBACK] Verified daily budget restored to ₹${restoredValue.toFixed(2)} (Req: ${amazonRequestId}).`
        : `[DEMO ROLLBACK] Mock Amazon verified daily budget restored to ₹${restoredValue.toFixed(2)} (MockReq: ${amazonRequestId}).`;
  } else {
    throw new Error(
      `Rollback is not yet supported for entity type "${entityType}".`
    );
  }

  // 2. Persist verified rollback in Database
  return prisma.$transaction(async (tx) => {
    if (entityType === "keyword") {
      await tx.keyword.update({
        where: { id: entityId },
        data: { bid: restoredValue },
      });
    } else if (entityType === "campaign") {
      await tx.campaign.update({
        where: { id: entityId },
        data: { dailyBudget: restoredValue },
      });
    }

    // Record audit log for rollback
    await tx.auditLog.create({
      data: {
        amazonAccountId: originalAudit.amazonAccountId,
        recommendationId: originalAudit.recommendationId,
        entityType,
        entityId,
        action: "ROLLBACK",
        previousValue: currentValue === null ? null : String(currentValue),
        newValue: String(restoredValue),
        reason: `Rollback of ${originalAudit.action} execution to pre-execution state.`,
        aiModel: "deterministic-engine-v2",
        promptVersion: "not-applicable",
        strategyVersion: mode === "REAL" ? "production-v1" : "demo-v1",
        confidence: originalAudit.confidence,
        approvalStatus: "APPROVED",
        executionResult: "SUCCESS",
        amazonRequestId,
        connectorMode: mode,
        rawResponse: JSON.stringify({
          connector: mode === "REAL" ? "RealAmazonConnector" : "MockAmazonConnector",
          mode,
          rollbackOfAuditLogId: originalAudit.id,
          requestId: amazonRequestId,
          verified: true,
          message: rollbackMessage,
        }),
        rollbackInfo: JSON.stringify({
          available: false,
          rollbackOfAuditLogId: originalAudit.id,
        }),
      },
    });

    return {
      success: true,
      action: "ROLLBACK",
      entityType,
      entityId,
      connectorMode: mode,
      amazonRequestId,
      previousValue: currentValue as number,
      restoredValue,
      message: rollbackMessage,
    };
  });
}