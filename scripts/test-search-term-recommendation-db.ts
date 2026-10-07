import { prisma } from "../src/lib/prisma";
import { SearchTermRecommendationService } from "../src/lib/services/search-term-recommendation.service";

async function main() {
  const account = await prisma.amazonAccount.findFirst({
    where: {
      isLiveAccount: false,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!account) {
    throw new Error("No DEMO Amazon account found.");
  }

  const first =
    await SearchTermRecommendationService.generateForAccount(
      account.id
    );

  console.table(first);

  if (first.length === 0) {
    throw new Error(
      "Expected at least one search-term recommendation."
    );
  }

  const negative = first.find(
    (row) =>
      row.actionType === "ADD_NEGATIVE_KEYWORD"
  );

  if (!negative) {
    throw new Error(
      "Expected ADD_NEGATIVE_KEYWORD recommendation."
    );
  }

  const increase = first.find(
    (row) =>
      row.actionType === "INCREASE_BID"
  );

  if (!increase) {
    throw new Error(
      "Expected INCREASE_BID recommendation."
    );
  }

  const stored =
    await prisma.recommendation.findUnique({
      where: {
        id: negative.recommendationId,
      },
      select: {
        actionType: true,
        approvalStatus: true,
        approvalSource: true,
        requiresApproval: true,
        executionState: true,
        searchTermId: true,
        idempotencyKey: true,
      },
    });

  if (!stored) {
    throw new Error(
      "Persisted recommendation was not found."
    );
  }

  if (stored.actionType !== "ADD_NEGATIVE_KEYWORD") {
    throw new Error(
      `Unexpected action type: ${stored.actionType}`
    );
  }

  if (stored.approvalStatus !== "PENDING") {
    throw new Error(
      `Expected PENDING approval, got ${stored.approvalStatus}`
    );
  }

  if (stored.approvalSource !== "HUMAN_APPROVAL") {
    throw new Error(
      `Expected HUMAN_APPROVAL, got ${stored.approvalSource}`
    );
  }

  if (!stored.requiresApproval) {
    throw new Error(
      "Search-term recommendation must require approval."
    );
  }

  if (stored.executionState !== "PENDING") {
    throw new Error(
      `Expected PENDING execution state, got ${stored.executionState}`
    );
  }

  if (!stored.searchTermId) {
    throw new Error(
      "Recommendation must reference its search term."
    );
  }

  if (!stored.idempotencyKey) {
    throw new Error(
      "Recommendation must have an idempotency key."
    );
  }

  const second =
    await SearchTermRecommendationService.generateForAccount(
      account.id
    );

  if (second.length !== first.length) {
    throw new Error(
      `Duplicate protection failed: first=${first.length}, second=${second.length}`
    );
  }

  console.log(
    "\nCHUNK 10 PASSED - SEARCH-TERM RECOMMENDATIONS PERSISTED SAFELY"
  );
}

main()
  .catch((error) => {
    console.error(
      "\nCHUNK 10 FAILED:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
