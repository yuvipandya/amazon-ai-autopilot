import { prisma } from "@/lib/prisma";
import { validateRecommendation } from "./validation";
import { evaluatePolicy } from "./policy";
import { evaluateRisk } from "./risk";
import { evaluatePermission } from "./permission";
import { executeRecommendation } from "./execution";

export type AutopilotAction =
  | "EXECUTE"
  | "IGNORE"
  | "LOCK";

export async function runAutopilotAction(
  recommendationId: string,
  action: AutopilotAction
) {
  const recommendation =
    await prisma.recommendation.findUnique({
      where: {
        id: recommendationId,
      },

      include: {
        amazonAccount: true,
        keyword: true,
        campaign: true,
        searchTerm: true,
      },
    });

  if (!recommendation) {
    throw new Error(
      "Recommendation not found."
    );
  }

  /*
   * ----------------------------------------
   * IGNORE
   * ----------------------------------------
   */

  if (action === "IGNORE") {
    const updated =
      await prisma.recommendation.update({
        where: {
          id: recommendationId,
        },

        data: {
          status: "IGNORED",
          approvalStatus: "REJECTED",
        },
      });

    await prisma.auditLog.create({
      data: {
        amazonAccountId:
          recommendation.amazonAccountId,

        recommendationId,

        entityType: "recommendation",

        entityId: recommendationId,

        action: "IGNORE",

        previousValue: null,

        newValue: null,

        reason:
          "Seller chose to ignore the recommendation.",

        aiModel:
          "deterministic-demo-engine",

        strategyVersion:
          "demo-v1",

        confidence:
          recommendation.confidence,

        approvalStatus:
          "REJECTED",

        executionResult:
          "IGNORED",

        rawResponse:
          JSON.stringify({
            action: "IGNORE",
          }),

        rollbackInfo:
          JSON.stringify({
            available: false,
          }),
      },
    });

    return {
      success: true,
      action: "IGNORED",
      recommendation: updated,
    };
  }

  /*
   * ----------------------------------------
   * LOCK
   * ----------------------------------------
   */

  if (action === "LOCK") {
    const updated =
      await prisma.recommendation.update({
        where: {
          id: recommendationId,
        },

        data: {
          status: "LOCKED",
          approvalStatus: "REJECTED",
        },
      });

    await prisma.auditLog.create({
      data: {
        amazonAccountId:
          recommendation.amazonAccountId,

        recommendationId,

        entityType: "recommendation",

        entityId: recommendationId,

        action: "LOCK",

        reason:
          "Seller locked this recommendation to prevent execution.",

        aiModel:
          "deterministic-demo-engine",

        strategyVersion:
          "demo-v1",

        confidence:
          recommendation.confidence,

        approvalStatus:
          "REJECTED",

        executionResult:
          "LOCKED",

        rawResponse:
          JSON.stringify({
            action: "LOCK",
          }),

        rollbackInfo:
          JSON.stringify({
            available: false,
          }),
      },
    });

    return {
      success: true,
      action: "LOCKED",
      recommendation: updated,
    };
  }

  /*
   * ----------------------------------------
   * EXECUTE
   * ----------------------------------------
   */

  if (action === "EXECUTE") {
    const validation =
      await validateRecommendation(
        recommendation
      );

    if (!validation.passed) {
      return {
        success: false,
        stage: "VALIDATION",
        message: validation.reason,
        validation,
      };
    }

    const policy = evaluatePolicy({
      actionType:
        recommendation.actionType,

      risk:
        recommendation.risk,

      status:
        recommendation.status,

      accountStatus:
        recommendation.amazonAccount
          .status,

      automationLevel:
        recommendation.amazonAccount
          .automationLevel,
    });

    if (!policy.passed) {
      return {
        success: false,
        stage: "POLICY",
        message: policy.reason,
        validation,
        policy,
      };
    }

    const risk = evaluateRisk({
      risk:
        recommendation.risk,

      changePercent:
        recommendation.changePercent,

      actionType:
        recommendation.actionType,
    });

    if (!risk.passed) {
      return {
        success: false,
        stage: "RISK",
        message: risk.reason,
        validation,
        policy,
        risk,
      };
    }

    const permission =
      evaluatePermission({
        automationLevel:
          recommendation.amazonAccount
            .automationLevel,

        actionType:
          recommendation.actionType,

        risk:
          recommendation.risk,

        explicitUserApproval: true,
      });

    if (!permission.allowed) {
      return {
        success: false,
        stage: "PERMISSION",
        message: permission.reason,
        validation,
        policy,
        risk,
        permission,
      };
    }

    const execution =
      await executeRecommendation({
        recommendationId,
      });

    return {
      success: true,
      stage: "EXECUTION",
      message:
        "Recommendation executed successfully.",
      validation,
      policy,
      risk,
      permission,
      execution,
    };
  }

  throw new Error(
    `Unsupported autopilot action: ${action}`
  );
}