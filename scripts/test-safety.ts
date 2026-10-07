import { prisma } from "../src/lib/prisma";
import { validateRecommendation } from "../src/lib/engines/validation";

async function main() {
  console.log("");
  console.log("==========================================");
  console.log(" AMAZON AI AUTOPILOT SAFETY TEST");
  console.log("==========================================");
  console.log("");

  const recommendation =
    await prisma.recommendation.findFirst({
      where: {
        actionType: "INCREASE_BID",
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
      "No INCREASE_BID recommendation found."
    );
  }

  if (!recommendation.keyword) {
    throw new Error(
      "The bid recommendation has no keyword."
    );
  }

  const currentBid = recommendation.keyword.bid;

  /*
   * Intentionally create a 16.67% bid increase.
   *
   * Example:
   * ₹12 → ₹14 = +16.67%
   *
   * This MUST be rejected because the absolute
   * safety ceiling is 15%.
   */
  const maliciousRecommendation = {
    ...recommendation,

    currentValue: currentBid,
    recommendedValue: currentBid * (1 + 16.67 / 100),
    changePercent: 16.67,
    status: "PENDING",

    amazonAccount: {
      id: recommendation.amazonAccount.id,
      maxBidChange:
        recommendation.amazonAccount.maxBidChange,
      maxBudgetChange:
        recommendation.amazonAccount.maxBudgetChange,
      status: recommendation.amazonAccount.status,
      automationLevel:
        recommendation.amazonAccount.automationLevel,
      automationPaused:
        recommendation.amazonAccount.automationPaused,
    },
  };

  console.log(
    `Account max bid change: ${recommendation.amazonAccount.maxBidChange}%`
  );

  console.log(
    `Hard safety ceiling: 15%`
  );

  console.log(
    `Current bid: ₹${currentBid.toFixed(2)}`
  );

  console.log(
    `Test bid: ₹${maliciousRecommendation.recommendedValue.toFixed(
      2
    )}`
  );

  console.log(
    `Attempted change: +${(
      ((maliciousRecommendation.recommendedValue -
        currentBid) /
        currentBid) *
      100
    ).toFixed(2)}%`
  );

  console.log("");
  console.log("Running deterministic validation...");
  console.log("");

  const result =
    await validateRecommendation(
      maliciousRecommendation
    );

  for (const check of result.checks) {
    console.log(
      `${check.passed ? "✅" : "❌"} ${check.name}: ${check.message}`
    );
  }

  console.log("");
  console.log(
    `VALIDATION RESULT: ${
      result.passed ? "PASSED" : "REJECTED"
    }`
  );

  console.log(
    `Reason: ${result.reason}`
  );

  console.log("");

  if (result.passed) {
    console.error(
      "🚨 SAFETY TEST FAILED: Oversized bid change was accepted."
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "✅ SAFETY TEST PASSED"
  );

  console.log(
    "The 16.67% bid change was correctly rejected before execution."
  );

  console.log("");
  console.log("==========================================");
}

main()
  .catch((error) => {
    console.error("");
    console.error("❌ TEST ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });