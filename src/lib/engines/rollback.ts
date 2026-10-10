
import { prisma } from "@/lib/prisma";
import { getAmazonConnector } from "@/lib/amazon/connector-factory";

export type RollbackInput = {
  recommendationId: string;
  organizationId: string;
  actor?: string;
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
      action: { not: "ROLLBACK" },
      amazonAccount: { organizationId: input.organizationId },
    },
    include: { amazonAccount: true },
    orderBy: { createdAt: "desc" },
  });

  if (!originalAudit) {
    throw new Error("No authorized successful execution was found for rollback.");
  }

  const account = originalAudit.amazonAccount;

  if (account.organizationId !== input.organizationId) {
    throw new Error("Rollback denied: account organization mismatch.");
  }

  if (account.status !== "ACTIVE") {
    throw new Error("Rollback denied: Amazon account is not active.");
  }

  if (account.automationPaused) {
    throw new Error("Rollback execution is blocked by the kill switch.");
  }

  if (!originalAudit.rollbackInfo) {
    throw new Error("This execution does not contain rollback information.");
  }

  let rollbackInfo: {
    available?: boolean;
    previousValue?: number;
    snapshot?: Record<string, unknown>;
    rollbackOfAuditLogId?: string;
  };

  try {
    rollbackInfo = JSON.parse(originalAudit.rollbackInfo);
  } catch {
    throw new Error("Rollback information is invalid.");
  }

  if (
    rollbackInfo.available !== true ||
    rollbackInfo.previousValue === undefined ||
    !Number.isFinite(Number(rollbackInfo.previousValue))
  ) {
    throw new Error("Rollback is not available for this execution.");
  }

  const restoredValue = Number(rollbackInfo.previousValue);
  const entityType = originalAudit.entityType;
  const entityId = originalAudit.entityId;

  // Claim the rollback before sending any connector write.
  // A prior rollback event prevents replay.
  const alreadyRolledBack = await prisma.auditLog.findFirst({
    where: {
      recommendationId: input.recommendationId,
      action: "ROLLBACK",
      executionResult: { in: ["SUCCESS", "SUBMITTED"] },
    },
    select: { id: true },
  });

  if (alreadyRolledBack) {
    throw new Error("Rollback already exists for this recommendation.");
  }

  const { connector, mode } = getAmazonConnector(account);
  const profileId = account.profileId || "default-profile";

  let currentValue: number;
  let amazonRequestId = "";
  let rollbackMessage = "";
  let target: { id: string; accountId: string };

  if (entityType === "keyword") {
    const keyword = await prisma.keyword.findUnique({
      where: { id: entityId },
      include: { campaign: true },
    });

    if (!keyword) throw new Error("Rollback target keyword no longer exists.");

    target = {
      id: keyword.id,
      accountId: keyword.campaign.amazonAccountId,
    };
    currentValue = keyword.bid;

    if (target.accountId !== account.id) {
      throw new Error("Rollback denied: keyword belongs to another account.");
    }

    if (
      originalAudit.newValue === null ||
      !Number.isFinite(Number(originalAudit.newValue)) ||
      Math.abs(currentValue - Number(originalAudit.newValue)) > 0.001
    ) {
      throw new Error("Rollback stopped: keyword value has drifted.");
    }

    // Recheck the kill switch immediately before the connector write.
    const freshAccount = await prisma.amazonAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    if (freshAccount.status !== "ACTIVE" || freshAccount.automationPaused) {
      throw new Error("Rollback blocked: account is inactive or automation is paused.");
    }

    const claim = await prisma.recommendation.updateMany({
      where: {
        id: input.recommendationId,
        status: "EXECUTED",
        executionState: "VERIFIED_SUCCESS",
      },
      data: { executionState: "SUBMITTED" },
    });

    if (claim.count !== 1) {
      throw new Error("Rollback blocked: another operation owns this recommendation, or its execution state has changed.");
    }

    const write = await connector.updateKeywordBid(profileId, {
      keywordId: keyword.amazonKeywordId || keyword.id,
      newBid: restoredValue,
      previousBid: currentValue,
    });

    amazonRequestId = write.metadata.requestId;
    if (!write.success) throw new Error(`Rollback write failed: ${write.error}`);

    const verification = await connector.verifyKeywordBid(
      profileId,
      keyword.amazonKeywordId || keyword.id,
      restoredValue
    );

    if (!verification.verified) {
      throw new Error(`Rollback verification failed: ${verification.message}`);
    }

    rollbackMessage = `Verified keyword bid restored to ${restoredValue.toFixed(2)} (${mode}).`;
  } else if (entityType === "campaign") {
    const campaign = await prisma.campaign.findUnique({
      where: { id: entityId },
    });

    if (!campaign) throw new Error("Rollback target campaign no longer exists.");

    target = { id: campaign.id, accountId: campaign.amazonAccountId };
    currentValue = campaign.dailyBudget;

    if (target.accountId !== account.id) {
      throw new Error("Rollback denied: campaign belongs to another account.");
    }

    if (
      originalAudit.newValue === null ||
      !Number.isFinite(Number(originalAudit.newValue)) ||
      Math.abs(currentValue - Number(originalAudit.newValue)) > 0.001
    ) {
      throw new Error("Rollback stopped: campaign budget has drifted.");
    }

    const freshAccount = await prisma.amazonAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    if (freshAccount.status !== "ACTIVE" || freshAccount.automationPaused) {
      throw new Error("Rollback blocked: account is inactive or automation is paused.");
    }

    const claim = await prisma.recommendation.updateMany({
      where: {
        id: input.recommendationId,
        status: "EXECUTED",
        executionState: "VERIFIED_SUCCESS",
      },
      data: { executionState: "SUBMITTED" },
    });

    if (claim.count !== 1) {
      throw new Error("Rollback blocked: another operation owns this recommendation, or its execution state has changed.");
    }

    const write = await connector.updateCampaignBudget(profileId, {
      campaignId: campaign.amazonCampaignId || campaign.id,
      newBudget: restoredValue,
      previousBudget: currentValue,
    });

    amazonRequestId = write.metadata.requestId;
    if (!write.success) throw new Error(`Rollback write failed: ${write.error}`);

    const verification = await connector.verifyCampaignBudget(
      profileId,
      campaign.amazonCampaignId || campaign.id,
      restoredValue
    );

    if (!verification.verified) {
      throw new Error(`Rollback verification failed: ${verification.message}`);
    }

    rollbackMessage = `Verified campaign budget restored to ${restoredValue.toFixed(2)} (${mode}).`;
  } else {
    throw new Error(`Rollback is not supported for entity type "${entityType}".`);
  }

  // Persist local state and audit only after connector verification.
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.auditLog.findFirst({
      where: {
        recommendationId: input.recommendationId,
        action: "ROLLBACK",
        executionResult: { in: ["SUCCESS", "SUBMITTED"] },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new Error("Rollback already exists for this recommendation.");
    }

    if (entityType === "keyword") {
      await tx.keyword.update({
        where: { id: entityId },
        data: { bid: restoredValue },
      });
    } else {
      await tx.campaign.update({
        where: { id: entityId },
        data: { dailyBudget: restoredValue },
      });
    }

    await tx.recommendation.update({
      where: { id: input.recommendationId },
      data: { executionState: "VERIFIED_SUCCESS" },
    });

    await tx.auditLog.create({
      data: {
        amazonAccountId: originalAudit.amazonAccountId,
        recommendationId: originalAudit.recommendationId,
        entityType,
        entityId,
        action: "ROLLBACK",
        previousValue: String(currentValue),
        newValue: String(restoredValue),
        reason: `Verified rollback of ${originalAudit.action}.`,
        aiModel: "deterministic-engine-v3",
        promptVersion: "not-applicable",
        strategyVersion: mode === "REAL" ? "production-v1" : "demo-v1",
        confidence: originalAudit.confidence,
        approvalStatus: "APPROVED",
        executionResult: "SUCCESS",
        amazonRequestId,
        connectorMode: mode,
        rawResponse: JSON.stringify({
          mode,
          actor: input.actor ?? "unknown",
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
      previousValue: currentValue,
      restoredValue,
      message: rollbackMessage,
    };
  });
}
