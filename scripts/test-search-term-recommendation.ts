import { generateSearchTermRecommendation } from "../src/lib/engines/search-term-recommendation";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const underfunded = generateSearchTermRecommendation({
  value: "kundan bridal necklace",
  classification: "UNDERFUNDED_WINNER",
  orders: 7,
  spend: 410.5,
  sales: 2899,
  acos: 0.1416,
});

assert(
  underfunded?.actionType === "INCREASE_BID",
  "UNDERFUNDED_WINNER should recommend INCREASE_BID"
);

assert(
  underfunded?.requiresApproval === true,
  "Bid recommendation must require human approval"
);

assert(
  underfunded?.autonomousEligible === false,
  "Search-term bid recommendation must never be autonomously eligible"
);

const waste = generateSearchTermRecommendation({
  value: "cheap imitation jewellery",
  classification: "HIGH_SPEND_ZERO_ORDER",
  orders: 0,
  spend: 392.4,
  sales: 0,
  acos: 1,
});

assert(
  waste?.actionType === "ADD_NEGATIVE_KEYWORD",
  "HIGH_SPEND_ZERO_ORDER should recommend ADD_NEGATIVE_KEYWORD"
);

assert(
  waste?.requiresApproval === true,
  "Negative keyword recommendation must require human approval"
);

assert(
  waste?.autonomousEligible === false,
  "Negative keyword recommendation must never be autonomously eligible"
);

const neutral = generateSearchTermRecommendation({
  value: "gold necklace women",
  classification: "NEUTRAL",
  orders: 1,
  spend: 220,
  sales: 1499,
  acos: 0.1467,
});

assert(
  neutral === null,
  "NEUTRAL search terms should not generate recommendations"
);

console.log(
  "\nCHUNK 9 PASSED - SEARCH-TERM RECOMMENDATION ENGINE"
);
