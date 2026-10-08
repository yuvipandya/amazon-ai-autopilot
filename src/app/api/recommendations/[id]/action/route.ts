import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getAuthorizedRecommendation } from "@/lib/auth/authorization";
import {
  runAutopilotAction,
} from "@/lib/engines/autopilot";
import {
  rollbackRecommendation,
} from "@/lib/engines/rollback";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } = await params;


    const session = await requireAuth();

    const authorizedRecommendation =
      await getAuthorizedRecommendation(id);

    if (!authorizedRecommendation) {
      return NextResponse.json(
        {
          success: false,
          error: "Recommendation not found.",
        },
        {
          status: 404,
        }
      );
    }

const body = await request.json();

    const action = String(
      body.action ?? ""
    ).toUpperCase();

  if (
  action !== "APPROVE" && action !== "REJECT" && action !== "EXECUTE" &&
  action !== "IGNORE" &&
  action !== "LOCK" &&
  action !== "ROLLBACK"
) {
      return NextResponse.json(
        {
          success: false,
          error:
          "Action must be APPROVE, REJECT, EXECUTE, IGNORE, LOCK, or ROLLBACK.",
        },
        {
          status: 400,
        }
      );
    }

    if (action === "APPROVE" || action === "REJECT") {
      if (authorizedRecommendation.status !== "PENDING") {
        return NextResponse.json(
          {
            success: false,
            error: `Recommendation is already ${authorizedRecommendation.status}.`,
          },
          { status: 409 }
        );
      }

      const approved = action === "APPROVE";

      const updated = await prisma.recommendation.update({
        where: { id },
        data: approved
          ? {
              status: "APPROVED",
              approvalStatus: "APPROVED",
              approvalSource: "HUMAN_APPROVAL",
              approvalActor: session.user.id,
              approvalTimestamp: new Date(),
            }
          : {
              status: "REJECTED",
              approvalStatus: "REJECTED",
              approvalSource: "HUMAN_APPROVAL",
              approvalActor: session.user.id,
              approvalTimestamp: new Date(),
            },
      });

      return NextResponse.json({
        success: true,
        action,
        recommendation: updated,
      });
    }

    /*
     * Emergency kill switch.
     *
     * IGNORE and LOCK are still allowed while automation
     * is paused because they do not execute an Amazon change.
     *
     * EXECUTE is blocked before the autopilot engine is called.
     */
    if (action === "EXECUTE") {
      if (authorizedRecommendation.status !== "APPROVED") {
        return NextResponse.json(
          {
            success: false,
            error: "Recommendation must be approved before execution.",
          },
          { status: 409 }
        );
      }

      if (authorizedRecommendation.amazonAccount.automationPaused) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Automation is currently paused. Resume automation before executing changes.",
          },
          {
            status: 422,
          }
        );
      }
    }

    if (action === "ROLLBACK") {
  const result =
    await rollbackRecommendation({
      recommendationId: id,
    });

  return NextResponse.json(result);
}

    const result =
      await runAutopilotAction(
        id,
        action as
          | "EXECUTE"
          | "IGNORE"
          | "LOCK"
      );

    if (!result.success) {
      return NextResponse.json(
        result,
        {
          status: 422,
        }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Autopilot action failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Autopilot action failed.",
      },
      {
        status: 500,
      }
    );
  }
}
