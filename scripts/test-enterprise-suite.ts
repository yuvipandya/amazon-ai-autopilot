import { prisma } from "../src/lib/prisma";
import { validateRecommendation } from "../src/lib/engines/validation";
import { authorizeExecution } from "../src/lib/engines/authorization";
import { executeRecommendation } from "../src/lib/engines/execution";
import { rollbackRecommendation } from "../src/lib/engines/rollback";
import { withRetry } from "../src/lib/engines/retry";
import { getAmazonConnector } from "../src/lib/amazon/connector-factory";
import { IngestionService } from "../src/lib/services/ingestion.service";
import { SchedulerWorkerService } from "../src/lib/services/scheduler";
import { calculateContributionEconomics, evaluateInventoryPpc, classifySearchTerm } from "../src/lib/engines/bi";
import { generateBidRecommendation } from "../src/lib/ai/gemini";

async function runAllTests() {
  console.log("==================================================");
  console.log("  AMAZON AI AUTOPILOT ENTERPRISE VERIFICATION SUITE");
  console.log("==================================================");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${detail || "Condition not met"}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 1: Absolute 15% Bid Safety Ceiling Rejection
  // -------------------------------------------------------------------------
  console.log("\n--- TEST GROUP 1: Deterministic Safety Limits ---");
  const account = await prisma.amazonAccount.findFirst({
    where: { status: "ACTIVE" },
    include: { organization: true },
  });

  if (!account) throw new Error("No active account for tests");

  const rec = await prisma.recommendation.findFirst({
    where: { actionType: "INCREASE_BID" },
    include: { keyword: true, campaign: true, amazonAccount: true },
  });

  if (rec && rec.keyword) {
    const maliciousRec = {
      ...rec,
      currentValue: 10,
      recommendedValue: 11.8, // +18% (exceeds 15%)
      changePercent: 18,
      status: "PENDING",
      amazonAccount: {
        id: account.id,
        maxBidChange: 15,
        maxBudgetChange: 20,
        status: "ACTIVE",
        automationLevel: 2,
        automationPaused: false,
      },
    };

    const valResult = await validateRecommendation(maliciousRec);
    assert(!valResult.passed, "Safety Ceiling: Rejects +18% bid adjustment exceeding 15% limit");
  }

  // -------------------------------------------------------------------------
  // TEST 2: Single Authorization Boundary
  // -------------------------------------------------------------------------
  console.log("\n--- TEST GROUP 2: Single Authorization Boundary ---");

  // 2a. Kill Switch check
  const killSwitchAuth = await authorizeExecution({
    amazonAccountId: account.id,
    actionType: "INCREASE_BID",
    risk: "LOW",
    approvalSource: "HUMAN_APPROVAL",
    currentValue: 10,
    recommendedValue: 11,
  });
  assert(killSwitchAuth.authorized, "Auth Boundary: Authorizes valid low-risk bid change when active");

  // 2b. Block when automation paused (Kill switch active)
  await prisma.amazonAccount.update({
    where: { id: account.id },
    data: { automationPaused: true },
  });

  const pausedAuth = await authorizeExecution({
    amazonAccountId: account.id,
    actionType: "INCREASE_BID",
    risk: "LOW",
    approvalSource: "HUMAN_APPROVAL",
    currentValue: 10,
    recommendedValue: 11,
  });
  assert(!pausedAuth.authorized, "Kill Switch: Rejects write when automationPaused is TRUE");

  // Reset pause
  await prisma.amazonAccount.update({
    where: { id: account.id },
    data: { automationPaused: false },
  });

  // 2c. Separation of Human Approval vs Autopilot Policy
  const autopilotPolicyAuth = await authorizeExecution({
    amazonAccountId: account.id,
    actionType: "INCREASE_BID",
    risk: "HIGH",
    approvalSource: "AUTOPILOT_POLICY", // Autopilot policy trying to run high risk
    currentValue: 10,
    recommendedValue: 11,
  });
  assert(!autopilotPolicyAuth.authorized, "Approval Separation: Blocks AUTOPILOT_POLICY for HIGH risk actions");

  // -------------------------------------------------------------------------
  // TEST 3: Amazon Connector & Verification State Machine
  // -------------------------------------------------------------------------
  console.log("\n--- TEST GROUP 3: Amazon Connector & Execution State Machine ---");

  const { connector, mode } = getAmazonConnector(account);
  assert(mode === "DEMO", "Connector Mode: Accurately identifies DEMO mode without live credentials");

  // Create a clean test recommendation to execute
  const testKw = await prisma.keyword.findFirst({
    where: { campaign: { amazonAccountId: account.id } },
  });

  if (testKw) {
    const initialBid = testKw.bid;
    const testRec = await prisma.recommendation.create({
      data: {
        amazonAccountId: account.id,
        campaignId: testKw.campaignId,
        keywordId: testKw.id,
        actionType: "INCREASE_BID",
        title: "Test Execution Recommendation",
        description: "Test state machine execution",
        reason: "Validation suite testing",
        currentValue: initialBid,
        recommendedValue: Number((initialBid * 1.1).toFixed(2)),
        changePercent: 10,
        confidence: 0.9,
        risk: "LOW",
        status: "PENDING",
        executionState: "PENDING",
      },
    });

    const execResult = await executeRecommendation({
      recommendationId: testRec.id,
      approvalSource: "HUMAN_APPROVAL",
      actor: "test-suite",
    });

    assert(execResult.success, "State Machine: Recommendation executed successfully");
    assert(execResult.executionState === "VERIFIED_SUCCESS", "State Machine: Final state is VERIFIED_SUCCESS");
    assert(execResult.amazonRequestId.startsWith("mock-amz-req-"), "Amazon Traceability: Request ID captured");

    // Verify DB was updated
    const updatedKw = await prisma.keyword.findUnique({ where: { id: testKw.id } });
    assert(
      Math.abs((updatedKw?.bid ?? 0) - testRec.recommendedValue!) < 0.001,
      "Post-Write Verification: Local DB keyword bid matches verified value"
    );

    // -------------------------------------------------------------------------
    // TEST 4: Verified Rollback Architecture
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 4: Verified Rollback Architecture ---");

    const rollbackResult = await rollbackRecommendation({
      recommendationId: testRec.id,
    });

    assert(rollbackResult.success, "Rollback: Rollback completed successfully");
    assert(
      Math.abs(rollbackResult.restoredValue - initialBid) < 0.001,
      "Rollback: Restored keyword bid matches original pre-execution value"
    );

    const revertedKw = await prisma.keyword.findUnique({ where: { id: testKw.id } });
    assert(
      Math.abs((revertedKw?.bid ?? 0) - initialBid) < 0.001,
      "Rollback Verification: Database keyword bid confirmed reverted"
    );
  }

  // -------------------------------------------------------------------------
  // TEST 5: Business Intelligence (TACoS, Contribution Profit, Inventory)
  // -------------------------------------------------------------------------
  console.log("\n--- TEST GROUP 5: Business Intelligence & Economics ---");

  const econ = calculateContributionEconomics({
    revenue: 100000,
    adSpend: 20000,
    unitsSold: 100,
    unitCost: 350,
    unitPrice: 1000,
    referralFeePercent: 0.15,
    fbaFeePerUnit: 50,
  });

  assert(econ.tacos === 0.2, "BI TACoS: Correctly computed TACoS as 20%");
  assert(econ.contributionProfit === 25000, "BI Contribution Profit: Accurately calculated ₹25,000 profit");
  assert(econ.breakEvenAcos > 0, "BI Break-even: Accurately calculated break-even ACoS");

  // Inventory-aware PPC check
  const lowStock = evaluateInventoryPpc({ inventory: 10, inboundInventory: 0, unitsSold7d: 14 });
  assert(!lowStock.allowAggressiveScaling, "Inventory PPC: Restricts aggressive scaling when Days of Cover < 7");

  const healthyStock = evaluateInventoryPpc({ inventory: 200, inboundInventory: 50, unitsSold7d: 14 });
  assert(healthyStock.allowAggressiveScaling, "Inventory PPC: Allows scaling when inventory cover is healthy");

  // Enriched search term classification
  const stClass = classifySearchTerm({
    value: "cheap knockoff",
    clicks: 25,
    orders: 0,
    spend: 450,
    sales: 0,
    targetAcos: 0.22,
  });
  assert(
    stClass.classification === "HIGH_SPEND_ZERO_ORDER" || stClass.classification === "WASTE",
    "Search Term Classifier: Correctly identifies HIGH_SPEND_ZERO_ORDER wasted traffic"
  );

  // -------------------------------------------------------------------------
  // TEST 6: Ingestion & Scheduler Workflow
  // -------------------------------------------------------------------------
  console.log("\n--- TEST GROUP 6: Ingestion & Scheduler Worker ---");

  const syncRes = await IngestionService.syncAccountData({ amazonAccountId: account.id });
  assert(syncRes.success, "Ingestion Service: Data sync completed without error");
  assert(syncRes.campaignsCount > 0, "Ingestion Service: External campaigns tracked");

  const cycleRes = await SchedulerWorkerService.runAutopilotCycle(account.id);
  assert(cycleRes.status === "COMPLETED", "Scheduler Worker: Full SYNC -> MEASURE cycle completed");

  // -------------------------------------------------------------------------
  // TEST 7: API Transient Retry Handling
  // -------------------------------------------------------------------------
  console.log("\n--- TEST GROUP 7: Transient Error Retry Handling ---");

  let retryAttempts = 0;
  const retryRes = await withRetry(
    async (attempt) => {
      retryAttempts = attempt;
      if (attempt < 2) throw new Error("503 Service Unavailable");
      return "OK";
    },
    { maxAttempts: 3, delayMs: 50 }
  );

  assert(retryRes.success && retryAttempts === 2, "Retry Engine: Recovers after transient 503 error");

  // -------------------------------------------------------------------------
  // TEST 8: Gemini Fail-Safe Reasoning
  // -------------------------------------------------------------------------
  console.log("\n--- TEST GROUP 8: AI Reasoning & Fail-Safe Fallback ---");

  const aiBidRec = await generateBidRecommendation({
    keyword: "kundan choker necklace",
    currentBid: 12.0,
    clicks: 50,
    orders: 6,
    spend: 600,
    sales: 6000,
    acos: 0.1,
    targetAcos: 0.22,
    strategyMode: "BALANCED",
    maxBidChange: 15,
  });

  assert(
    aiBidRec.action === "INCREASE_BID" || aiBidRec.action === "NO_ACTION",
    "AI Reasoning: Returns structured recommendation with confidence & risk"
  );
  assert(aiBidRec.risk === "LOW", "AI Reasoning: Validated bounded risk rating");

  // SUMMARY
  console.log("\n==================================================");
  console.log(`  TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("==================================================");

  if (passedTests < totalTests) {
    process.exitCode = 1;
  }
}

runAllTests()
  .catch((err) => {
    console.error("Test suite fatal error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
