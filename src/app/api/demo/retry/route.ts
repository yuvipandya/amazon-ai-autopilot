import { NextResponse } from "next/server";
import { withRetry } from "@/lib/engines/retry";
import { requireAuth } from "@/lib/auth/authorization";

export async function POST() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required.",
      },
      {
        status: 401,
      }
    );
  }

  let failures = 0;

  const result = await withRetry(
    async (attempt) => {
      failures = attempt;

      if (attempt < 3) {
        throw new Error(
          `Amazon Mock API returned 503 on attempt ${attempt}.`
        );
      }

      return {
        connector: "MockAmazonConnector",
        status: 200,
        message:
          "Mock Amazon API recovered after retry.",
      };
    },
    {
      maxAttempts: 3,
      delayMs: 300,
    }
  );

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        attempts: result.attempts,
        error:
          result.error?.message ??
          "Retry sequence failed.",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    success: true,
    attempts: result.attempts,
    result: result.result,
  });
}