import { MockAmazonReportingService } from "../src/lib/amazon/mock-reporting.service";

async function main() {
  const service = new MockAmazonReportingService();

  const rows = await service.getSearchTerms({
    profileId: "mock-profile-in-001",
    startDate: "2026-10-01",
    endDate: "2026-10-07",
  });

  if (rows.length !== 4) {
    throw new Error(
      `Expected 4 demo search terms, received ${rows.length}.`
    );
  }

  const required = [
    "kundan bridal necklace",
    "kundan necklace for bride",
    "cheap imitation jewellery",
    "gold necklace women",
  ];

  for (const term of required) {
    if (!rows.some((row) => row.searchTerm === term)) {
      throw new Error(
        `Missing demo search term: ${term}`
      );
    }
  }

  if (!rows.some((row) => row.orders > 0)) {
    throw new Error("Demo fixture has no converting search term.");
  }

  if (!rows.some((row) => row.orders === 0 && row.spend > 0)) {
    throw new Error(
      "Demo fixture has no wasted-spend search term."
    );
  }

  console.log("DEMO SEARCH-TERM REPORT");
  console.table(
    rows.map((row) => ({
      searchTerm: row.searchTerm,
      campaignId: row.campaignId,
      impressions: row.impressions,
      clicks: row.clicks,
      orders: row.orders,
      spend: row.spend,
      sales: row.sales,
    }))
  );

  console.log(
    "\nCHUNK 5 PASSED - DEMO REPORTING FIXTURES VERIFIED"
  );
}

main().catch((error) => {
  console.error(
    "\nCHUNK 5 FAILED:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
