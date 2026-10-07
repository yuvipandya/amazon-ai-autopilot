import {
  generateSearchTermRecommendation,
} from "../src/lib/ai/gemini";

async function main() {
  console.log("");
  console.log("==========================================");
  console.log(" AMAZON AI AUTOPILOT - GEMINI TEST");
  console.log("==========================================");
  console.log("");

  const result =
    await generateSearchTermRecommendation({
      value:
        "kundan bridal choker necklace",

      classification:
        "WINNER",

      clicks: 188,

      orders: 8,

      spend: 820,

      sales: 11600,

      acos: 0.071,
    });

  console.log(
    JSON.stringify(result, null, 2)
  );

  console.log("");
  console.log("==========================================");
  console.log(" GEMINI TEST PASSED");
  console.log("==========================================");
}

main().catch((error) => {
  console.error("");
  console.error("❌ GEMINI TEST FAILED");
  console.error("");
  console.error(error);
  process.exitCode = 1;
});