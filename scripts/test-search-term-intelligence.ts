import {
  classifySearchTerm,
} from "../src/lib/engines/search-term-intelligence";

function assert(
  condition: boolean,
  message: string
) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const winner = classifySearchTerm({
    impressions: 1840,
    clicks: 92,
    orders: 7,
    spend: 410.5,
    sales: 2899,
    acos: 410.5 / 2899,
  });

  assert(
    winner.classification === "WINNER",
    `Expected WINNER, got ${winner.classification}`
  );

  const wastedSpend = classifySearchTerm({
    impressions: 970,
    clicks: 84,
    orders: 0,
    spend: 392.4,
    sales: 0,
    acos: 1,
  });

  assert(
    wastedSpend.classification === "HIGH_SPEND_ZERO_ORDER",
    `Expected HIGH_SPEND_ZERO_ORDER, got ${wastedSpend.classification}`
  );

  const neutral = classifySearchTerm({
    impressions: 1000,
    clicks: 5,
    orders: 0,
    spend: 10,
    sales: 0,
    acos: 1,
  });

  assert(
    neutral.classification === "WASTE",
    `Expected WASTE, got ${neutral.classification}`
  );

  const noData = classifySearchTerm({
    impressions: 0,
    clicks: 0,
    orders: 0,
    spend: 0,
    sales: 0,
    acos: 0,
  });

  assert(
    noData.classification === "NEUTRAL",
    `Expected NEUTRAL, got ${noData.classification}`
  );

  console.log("SEARCH-TERM CLASSIFICATION TEST");
  console.table([
    {
      case: "Winner",
      classification: winner.classification,
      conversionRate: winner.conversionRate,
      acos: winner.acos,
      roas: winner.roas,
    },
    {
      case: "High spend / zero order",
      classification: wastedSpend.classification,
      conversionRate: wastedSpend.conversionRate,
      acos: wastedSpend.acos,
      roas: wastedSpend.roas,
    },
    {
      case: "Low spend / zero order",
      classification: neutral.classification,
      conversionRate: neutral.conversionRate,
      acos: neutral.acos,
      roas: neutral.roas,
    },
    {
      case: "No data",
      classification: noData.classification,
      conversionRate: noData.conversionRate,
      acos: noData.acos,
      roas: noData.roas,
    },
  ]);

  console.log(
    "\nCHUNK 7 PASSED - DETERMINISTIC SEARCH-TERM CLASSIFICATION"
  );
}

main();
