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

  const product = await prisma.product.findFirst({
    where: {
      amazonAccountId: account.id,
      campaigns: {
        some: {
          searchTerms: {
            some: {
              classification: {
                not: "NEUTRAL",
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      title: true,
    },
  });

  if (!product) {
    throw new Error(
      "No DEMO product with classified search terms found."
    );
  }

  const first =
    await SearchTermRecommendationService.generateForProduct(
      account.id,
      product.id
    );

  console.log(
    `\nProduct: ${product.title} (${product.id})`
  );

  console.table(first);

  if (first.length === 0) {
    throw new Error(
      "Expected at least one product-scoped recommendation."
    );
  }

  const invalidRecommendation =
    await prisma.recommendation.findFirst({
      where: {
        id: {
          in: first.map(
            (recommendation) =>
              recommendation.recommendationId
          ),
        },
        OR: [
          {
            productId: {
              not: product.id,
            },
          },
          {
            amazonAccountId: {
              not: account.id,
            },
          },
        ],
      },
      select: {
        id: true,
        productId: true,
        amazonAccountId: true,
      },
    });

  if (invalidRecommendation) {
    throw new Error(
      `Recommendation escaped product/account scope: ${invalidRecommendation.id}`
    );
  }

  const storedRecommendation = first[0];

  if (!storedRecommendation) {
    throw new Error(
      "Expected at least one recommendation."
    );
  }

  const stored =
    await prisma.recommendation.findUnique({
      where: {
        id: storedRecommendation.recommendationId,
      },
      select: {
        actionType: true,
        approvalStatus: true,
        approvalSource: true,
        requiresApproval: true,
        executionState: true,
        searchTermId: true,
        productId: true,
        amazonAccountId: true,
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

  if (stored.productId !== product.id) {
    throw new Error(
      "Recommendation product scope is incorrect."
    );
  }

  if (stored.amazonAccountId !== account.id) {
    throw new Error(
      "Recommendation account scope is incorrect."
    );
  }

  if (!stored.idempotencyKey) {
    throw new Error(
      "Recommendation must have an idempotency key."
    );
  }

  const second =
    await SearchTermRecommendationService.generateForProduct(
      account.id,
      product.id
    );

  if (second.length !== first.length) {
    throw new Error(
      `Duplicate protection failed: first=${first.length}, second=${second.length}`
    );
  }

  console.log(
    "\nCHUNK 11 PASSED - PRODUCT-SCOPED SEARCH-TERM RECOMMENDATIONS"
  );
}

main()
  .catch((error) => {
    console.error(
      "\nCHUNK 11 FAILED:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
