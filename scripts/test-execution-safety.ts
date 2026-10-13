import assert from "node:assert/strict";
import { executeRecommendation } from "../src/lib/engines/execution";

async function main() {
  let executionState = "PENDING";
  let writeCalls = 0;

  const account = {
    id: "fake-account",
    organizationId: "fake-org",
    profileId: "fake-profile",
    status: "ACTIVE",
    automationPaused: false,
  };

  const recommendation: any = {
    id: "fake-recommendation",
    status: "APPROVED",
    executionState: "PENDING",
    actionType: "INCREASE_BID",
    risk: "LOW",
    currentValue: 1,
    recommendedValue: 1.1,
    changePercent: 10,
    keywordId: "fake-keyword",
    campaignId: null,
    searchTermId: null,
    amazonAccountId: account.id,
    amazonAccount: account,
    keyword: {
      id: "fake-keyword",
      amazonKeywordId: "amazon-fake-keyword",
      value: "test keyword",
      matchType: "EXACT",
      campaignId: "fake-campaign",
      bid: 1,
    },
    campaign: null,
    searchTerm: null,
    reason: "Isolated safety test",
    confidence: 0.9,
  };

  const db: any = {
    recommendation: {
      findUnique: async () => recommendation,
      updateMany: async ({ where, data }: any) => {
        if (
          where.id !== recommendation.id ||
          where.status !== "APPROVED" ||
          where.executionState !== "PENDING" ||
          executionState !== "PENDING"
        ) {
          return { count: 0 };
        }

        executionState = data.executionState;
        return { count: 1 };
      },
      update: async ({ data }: any) => {
        executionState = data.executionState;
        return { ...recommendation, ...data };
      },
    },
  };

  const connector: any = {
    updateKeywordBid: async () => {
      writeCalls++;
      // Simulate a lost response: the external write may have happened,
      // but the caller receives an error and cannot know the outcome.
      throw new Error("Simulated timeout after write attempt");
    },
  };

  const dependencies: any = {
    db,
    connectorFactory: () => ({
      connector,
      mode: "DEMO",
      diagnostic: { configured: false, missingFields: [] },
    }),
    validate: async () => ({ passed: true, reason: "test approved" }),
    authorize: async () => ({ authorized: true, reason: "test authorized" }),
  };

  const input = {
    recommendationId: recommendation.id,
    approvalSource: "HUMAN_APPROVAL" as const,
  };

  console.log("Test 1: Race two callers against the atomic claim");
  const race = await Promise.allSettled([
    executeRecommendation(input, dependencies),
    executeRecommendation(input, dependencies),
  ]);

  assert.equal(
    race.filter((result) => result.status === "rejected").length,
    2,
    "Both calls should reject: one simulated write error and one rejected claim"
  );
  assert.equal(writeCalls, 1, "Only one caller may attempt the external write");
  assert.equal(executionState, "UNKNOWN", "Uncertain write must be recorded UNKNOWN");
  console.log("PASS: exactly one write attempt; uncertain outcome recorded UNKNOWN");

  console.log("Test 2: Retry the same recommendation");
  await assert.rejects(
    executeRecommendation(input, dependencies),
    /Execution claim rejected/
  );

  assert.equal(writeCalls, 1, "Retry must not issue another external write");
  assert.equal(executionState, "UNKNOWN", "Retry must not reset the uncertain state");
  console.log("PASS: retry blocked before another connector write");

  console.log("\nALL EXECUTION SAFETY TESTS PASSED");
}

main().catch((error) => {
  console.error("EXECUTION SAFETY TEST FAILED:", error);
  process.exitCode = 1;
});
