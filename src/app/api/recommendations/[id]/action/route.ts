import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  getAuthorizedRecommendation,
} from "@/lib/auth/authorization";
import { runAutopilotAction } from "@/lib/engines/autopilot";
import { rollbackRecommendation } from "@/lib/engines/rollback";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    const recommendation = await getAuthorizedRecommendation(id);

    if (!recommendation) {
      return NextResponse.json(
        { success: false, error: "Recommendation not found." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const action = String(body.action ?? "").toUpperCase();

    if (
      ![
        "APPROVE",
        "REJECT",
        "EXECUTE",
        "IGNORE",
        "LOCK",
        "ROLLBACK",
      ].includes(action)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Action must be APPROVE, REJECT, EXECUTE, IGNORE, LOCK, or ROLLBACK.",
        },
        { status: 400 }
      );
    }

    if (action === "APPROVE" || action === "REJECT") {
      if (recommendation.status !== "PENDING") {
        return NextResponse.json(
          {
            success: false,
            error: `Recommendation is already ${recommendation.status}.`,
          },
          { status: 409 }
        );
      }

      const approved = action === "APPROVE";
      const nextStatus = approved ? "APPROVED" : "REJECTED";
      const timestamp = new Date();

      const updated = await prisma.$transaction(async (tx) => {
        // Conditional update prevents two concurrent decisions from
        // both succeeding for the same pending recommendation.
        const result = await tx.recommendation.updateMany({
          where: {
            id,
            amazonAccount: {
              organizationId: session.user.organizationId,
            },
            status: "PENDING",
          },
          data: {
            status: nextStatus,
            approvalStatus: nextStatus,
            approvalSource: "HUMAN_APPROVAL",
            approvalActor: session.user.id,
            approvalTimestamp: timestamp,
          },
        });

        if (result.count !== 1) {
          throw new Error("RECOMMENDATION_DECISION_CONFLICT");
        }

        const current = await tx.recommendation.findUniqueOrThrow({
          where: { id },
        });

        await tx.auditLog.create({
          data: {
            amazonAccountId: current.amazonAccountId,
            recommendationId: current.id,
            entityType: "recommendation",
            entityId: current.id,
            action,
            previousValue: "PENDING",
            newValue: nextStatus,
            reason: approved
              ? "Seller approved the recommendation for execution."
              : "Seller rejected the recommendation.",
            aiModel: "approval-workflow",
            promptVersion: "not-applicable",
            strategyVersion: "approval-v1",
            confidence: current.confidence,
            approvalStatus: nextStatus,
            executionResult: approved
              ? "APPROVED_NOT_EXECUTED"
              : "REJECTED_NOT_EXECUTED",
            connectorMode: current.connectorMode,
            rawResponse: JSON.stringify({
              actor: session.user.id,
              timestamp: timestamp.toISOString(),
              action,
            }),
            rollbackInfo: JSON.stringify({ available: false }),
          },
        });

        return current;
      });

      return NextResponse.json({
        success: true,
        action,
        recommendation: updated,
      });
    }

    if (action === "EXECUTE") {
      if (recommendation.status !== "APPROVED") {
        return NextResponse.json(
          {
            success: false,
            error: "Recommendation must be approved before execution.",
          },
          { status: 409 }
        );
      }

      if (recommendation.amazonAccount.automationPaused) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Automation is currently paused. Resume automation before executing changes.",
          },
          { status: 422 }
        );
      }
    }

    if (action === "ROLLBACK") {
      const result = await rollbackRecommendation({
        recommendationId: id,
      });

      return NextResponse.json(result);
    }

    const result = await runAutopilotAction(
      id,
      action as "EXECUTE" | "IGNORE" | "LOCK"
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 422 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "RECOMMENDATION_DECISION_CONFLICT"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "This recommendation was already decided. Refresh and try again.",
        },
        { status: 409 }
      );
    }

    console.error("Autopilot action failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "Autopilot action failed.",
      },
      { status: 500 }
    );
  }
}
