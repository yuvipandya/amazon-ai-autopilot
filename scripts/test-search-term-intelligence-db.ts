import { prisma } from "../src/lib/prisma";
import { SearchTermIntelligenceService } from "../src/lib/services/search-term-intelligence.service";

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

  const results =
    await SearchTermIntelligenceService.analyzeAccount(
      account.id
    );

  console.log("SEARCH-TERM INTELLIGENCE");
  console.table(
    results.map((row) => ({
      searchTerm: row.value,
      orders: row.orders,
      spend: row.spend,
      sales: row.sales,
      acos: row.acos,
      classification: row.classification,
    }))
  );

  const winner = results.find(
    (row) => row.value === "kundan bridal necklace"
  );

  if (!winner) {
    throw new Error(
      "Expected kundan bridal necklace search term."
    );
  }

  if (winner.classification !== "UNDERFUNDED_WINNER") {
    throw new Error(
      `Expected kundan bridal necklace to be WINNER, got ${winner.classification}`
    );
  }

  const waste = results.find(
    (row) => row.value === "cheap imitation jewellery"
  );

  if (!waste) {
    throw new Error(
      "Expected cheap imitation jewellery search term."
    );
  }

  if (
    waste.classification !==
    "HIGH_SPEND_ZERO_ORDER"
  ) {
    throw new Error(
      `Expected cheap imitation jewellery to be HIGH_SPEND_ZERO_ORDER, got ${waste.classification}`
    );
  }

  const persisted = await prisma.searchTerm.findUnique({
    where: {
      id: winner.id,
    },
    select: {
      classification: true,
    },
  });

  if (
    persisted?.classification !== "UNDERFUNDED_WINNER"
  ) {
    throw new Error(
      `Classification was not persisted. Got ${persisted?.classification}`
    );
  }

  console.log(
    "\nCHUNK 8 PASSED - CLASSIFICATION WIRED TO PRISMA"
  );
}

main()
  .catch((error) => {
    console.error(
      "\nCHUNK 8 FAILED:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

