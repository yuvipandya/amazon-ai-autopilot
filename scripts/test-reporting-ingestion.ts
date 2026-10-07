import { prisma } from "../src/lib/prisma";
import { IngestionService } from "../src/lib/services/ingestion.service";

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

  const demoCampaignIds = [
    "mock-camp-001",
    "mock-camp-002",
  ];

  const campaigns = await prisma.campaign.findMany({
    where: {
      amazonAccountId: account.id,
      amazonCampaignId: {
        in: demoCampaignIds,
      },
    },
    select: {
      id: true,
      amazonCampaignId: true,
      name: true,
    },
  });

  if (campaigns.length !== 2) {
    throw new Error(
      `Expected 2 DEMO reporting campaigns, found ${campaigns.length}.`
    );
  }

  console.log("REPORTING CAMPAIGNS");
  console.table(campaigns);

  const result = await IngestionService.syncAccountData({
    amazonAccountId: account.id,
    reportPeriod: "LAST_14_DAYS",
  });

  console.log("\nSYNC RESULT");
  console.dir(result, { depth: null });

  const rows = await prisma.searchTerm.findMany({
    where: {
      campaign: {
        amazonAccountId: account.id,
        amazonCampaignId: {
          in: demoCampaignIds,
        },
      },
    },
    select: {
      value: true,
      impressions: true,
      clicks: true,
      orders: true,
      spend: true,
      sales: true,
      acos: true,
      campaign: {
        select: {
          amazonCampaignId: true,
        },
      },
    },
    orderBy: {
      value: "asc",
    },
  });

  console.log("\nREPORTING SEARCH TERMS IN DATABASE");
  console.table(
    rows.map((row) => ({
      campaignId: row.campaign.amazonCampaignId,
      searchTerm: row.value,
      impressions: row.impressions,
      clicks: row.clicks,
      orders: row.orders,
      spend: row.spend,
      sales: row.sales,
      acos: row.acos,
    }))
  );

  const expected = [
    "kundan bridal necklace",
    "kundan necklace for bride",
    "cheap imitation jewellery",
    "gold necklace women",
  ];

  for (const term of expected) {
    if (!rows.some((row) => row.value === term)) {
      throw new Error(
        `Missing reporting search term in DEMO campaign data: ${term}`
      );
    }
  }

  if (rows.length !== 4) {
    throw new Error(
      `Expected exactly 4 reporting search terms, found ${rows.length}.`
    );
  }

  if (!rows.some((row) => row.orders > 0)) {
    throw new Error("Reporting data contains no converting search term.");
  }

  if (!rows.some((row) => row.orders === 0 && row.spend > 0)) {
    throw new Error("Reporting data contains no wasted-spend search term.");
  }

  console.log(
    "\nCHUNK 6 PASSED - REPORTING DATA INGESTED INTO PRISMA"
  );
}

main()
  .catch((error) => {
    console.error(
      "\nCHUNK 6 FAILED:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
