import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

    const body = await request.json();

    const action = String(
      body.action ?? ""
    ).toUpperCase();

  if (
  action !== "EXECUTE" &&
  action !== "IGNORE" &&
  action !== "LOCK" &&
  action !== "ROLLBACK"
) {
      return NextResponse.json(
        {
          success: false,
          error:
 		 "Action must be EXECUTE, IGNORE, LOCK, or ROLLBACK.",
        },
        {
          status: 400,
        }
      );
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
      const recommendation =
        await prisma.recommendation.findUnique({
          where: {
            id,
          },
          select: {
            amazonAccount: {
              select: {
                automationPaused: true,
              },
            },
          },
        });

      if (!recommendation) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Recommendation not found.",
          },
          {
            status: 404,
          }
        );
      }

      if (
        recommendation.amazonAccount
          .automationPaused
      ) {
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