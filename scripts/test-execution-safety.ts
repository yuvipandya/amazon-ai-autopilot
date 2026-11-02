import assert from "node:assert/strict";
import { executeRecommendation, type ExecutionDependencies } from "../src/lib/engines/execution";

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

  const recommendation = {
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

  const db = {
    recommendation: {
      findUnique: async () => recommendation,
      updateMany: async ({ where, data }: { where: { id: string; status: string; executionState: string }; data: { executionState: string } }) => {
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
      update: async ({ data }: { data: { executionState: string } }) => {
        executionState = data.executionState;
        return { ...recommendation, ...data };
      },
    },
  };

  const connector = {
    updateKeywordBid: async () => {
      writeCalls++;
      // Simulate a lost response: the external write may have happened,
      // but the caller receives an error and cannot know the outcome.
      throw new Error("Simulated timeout after write attempt");
    },
  };

  const dependencies = {
    db,
    connectorFactory: () => ({
      connector,
      mode: "DEMO",
      diagnostic: { configured: false, missingFields: [] },
    }),
    validate: async () => ({ passed: true, reason: "test approved" }),
    authorize: async () => ({ authorized: true, reason: "test authorized" }),
  };

  const typedDependencies = dependencies as unknown as ExecutionDependencies;

  const input = {
    recommendationId: recommendation.id,
    approvalSource: "HUMAN_APPROVAL" as const,
  };

  console.log("Test 1: Race two callers against the atomic claim");
  const race = await Promise.allSettled([
    executeRecommendation(input, typedDependencies),
    executeRecommendation(input, typedDependencies),
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
    executeRecommendation(input, typedDependencies),
    /Execution claim rejected/
  );

  assert.equal(writeCalls, 1, "Retry must not issue another external write");
  assert.equal(executionState, "UNKNOWN", "Retry must not reset the uncertain state");
  console.log("PASS: retry blocked before another connector write");

  console.log("Test 3: live account is never executed against the DEMO connector");
  const liveWrites = { count: 0 };
  const liveRecommendation = {
    ...recommendation,
    id: "fake-live-recommendation",
    amazonAccount: { ...account, isLiveAccount: true },
  };
  const liveDependencies = {
    ...dependencies,
    db: {
      recommendation: {
        findUnique: async () => liveRecommendation,
        updateMany: async () => {
          liveWrites.count++;
          return { count: 1 };
        },
        update: async () => liveRecommendation,
      },
    },
    connectorFactory: () => ({
      connector: {
        updateKeywordBid: async () => {
          liveWrites.count++;
          throw new Error("must never be called");
        },
      },
      mode: "DEMO",
      diagnostic: { configured: false, missingFields: ["profileId (AMAZON_ADS_PROFILE_ID)"] },
    }),
  } as unknown as ExecutionDependencies;

  await assert.rejects(
    executeRecommendation(
      { recommendationId: liveRecommendation.id, approvalSource: "HUMAN_APPROVAL" },
      liveDependencies
    ),
    /Live Amazon account cannot execute in DEMO mode/
  );
  assert.equal(liveWrites.count, 0, "No claim or connector write may occur");
  console.log("PASS: live account blocked from silently using the mock connector");

  console.log("\nALL EXECUTION SAFETY TESTS PASSED");
}

main().catch((error) => {
  console.error("EXECUTION SAFETY TEST FAILED:", error);
  process.exitCode = 1;
});
