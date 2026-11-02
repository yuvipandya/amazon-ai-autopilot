import assert from "node:assert/strict";
import { rollbackRecommendation, type RollbackDependencies } from "../src/lib/engines/rollback";

type Scenario = {
  writeFails?: boolean;
  verificationFails?: boolean;
  finalizationFails?: boolean;
  recoveryFails?: boolean;
};

function makeFixture(scenario: Scenario = {}) {
  let executionState = "VERIFIED_SUCCESS";
  let rollbackEvent: { id: string; [key: string]: unknown; rawResponse?: string | null } | null = null;
  let transactionCalls = 0;
  let writeCalls = 0;
  let verificationCalls = 0;

  const account = {
    id: "fake-account",
    organizationId: "fake-org",
    status: "ACTIVE",
    automationPaused: false,
    profileId: "fake-profile",
  };

  const originalAudit = {
    id: "original-audit",
    amazonAccountId: account.id,
    recommendationId: "fake-recommendation",
    entityType: "keyword",
    entityId: "fake-keyword",
    action: "INCREASE_BID",
    executionResult: "SUCCESS",
    previousValue: "1",
    newValue: "2",
    confidence: 0.9,
    rollbackInfo: JSON.stringify({
      available: true,
      previousValue: 1,
      rollbackOfAuditLogId: "original-audit",
    }),
    amazonAccount: account,
  };

  const keyword = {
    id: "fake-keyword",
    amazonKeywordId: "amazon-fake-keyword",
    bid: 2,
    campaign: { amazonAccountId: account.id },
  };

  const tx = {
    auditLog: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        where.action === "ROLLBACK" ? rollbackEvent : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        rollbackEvent = { id: "fake-rollback-audit", ...data };
        return rollbackEvent;
      },
    },
    keyword: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        keyword.bid = Number(data.bid);
        return keyword;
      },
    },
    campaign: { update: async () => ({}) },
    recommendation: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        executionState = String(data.executionState);
        return { id: "fake-recommendation", executionState };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (
          where.executionState === "SUBMITTED" &&
          executionState === "SUBMITTED"
        ) {
          executionState = String(data.executionState);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };

  const db = {
    auditLog: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.action === "ROLLBACK") return rollbackEvent;
        return originalAudit;
      },
    },
    keyword: {
      findUnique: async () => ({ ...keyword, campaign: keyword.campaign }),
    },
    campaign: { findUnique: async () => null },
    amazonAccount: {
      findUniqueOrThrow: async () => account,
    },
    recommendation: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (
          where.executionState === "VERIFIED_SUCCESS" &&
          executionState === "VERIFIED_SUCCESS"
        ) {
          executionState = String(data.executionState);
          return { count: 1 };
        }

        if (
          where.executionState === "SUBMITTED" &&
          executionState === "SUBMITTED"
        ) {
          executionState = String(data.executionState);
          return { count: 1 };
        }

        return { count: 0 };
      },
    },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      transactionCalls++;

      const before = {
        executionState,
        rollbackEvent,
        keywordBid: keyword.bid,
      };

      try {
        if (scenario.recoveryFails && transactionCalls === 1) {
          throw new Error("Simulated recovery database failure");
        }

        const result = await callback(tx);

        // Simulate a commit failure after transaction work ran.
        if (scenario.finalizationFails && transactionCalls === 1) {
          throw new Error("Simulated database commit failure");
        }

        return result;
      } catch (error) {
        // Model transaction atomicity: discard all callback mutations.
        executionState = before.executionState;
        rollbackEvent = before.rollbackEvent;
        keyword.bid = before.keywordBid;
        throw error;
      }
    },
  };

  const connector = {
    updateKeywordBid: async () => {
      writeCalls++;
      return {
        success: !scenario.writeFails,
        error: scenario.writeFails ? "Simulated write failure" : undefined,
        metadata: { requestId: "fake-request-id" },
      };
    },
    verifyKeywordBid: async () => {
      verificationCalls++;
      return {
        verified: !scenario.verificationFails,
        message: scenario.verificationFails
          ? "Simulated verification failure"
          : "Verified",
      };
    },
  };

  const connectorFactory = () => ({
    connector,
    mode: "DEMO",
    diagnostic: { configured: false, missingFields: [] },
  });

  const run = () =>
    rollbackRecommendation(
      {
        recommendationId: "fake-recommendation",
        organizationId: "fake-org",
        actor: "isolated-test",
      },
      { db, connectorFactory } as unknown as RollbackDependencies
    );

  return {
    run,
    getState: () => ({
      executionState,
      rollbackEvent,
      keywordBid: keyword.bid,
      transactionCalls,
      writeCalls,
      verificationCalls,
    }),
  };
}

async function expectUncertain(
  name: string,
  scenario: Scenario,
  expectedWriteCalls: number,
  expectedVerificationCalls: number
) {
  const fixture = makeFixture(scenario);

  await assert.rejects(
    fixture.run(),
    /Rollback outcome is uncertain/
  );

  const state = fixture.getState();

  assert.equal(state.executionState, "UNKNOWN", `${name}: state`);
  assert.equal(
    state.rollbackEvent?.executionResult,
    "UNKNOWN",
    `${name}: recovery audit`
  );
  assert.equal(
    state.rollbackEvent?.rawResponse
      ? JSON.parse(state.rollbackEvent.rawResponse).reconciliationRequired
      : false,
    true,
    `${name}: reconciliation flag`
  );
  assert.equal(state.writeCalls, expectedWriteCalls, `${name}: writes`);
  assert.equal(
    state.verificationCalls,
    expectedVerificationCalls,
    `${name}: verification calls`
  );

  console.log(`[PASS] ${name}`);
}

async function main() {
  await expectUncertain("Write failure is marked uncertain", {
    writeFails: true,
  }, 1, 0);

  await expectUncertain("Verification failure is marked uncertain", {
    verificationFails: true,
  }, 1, 1);

  await expectUncertain("Finalization failure is marked uncertain", {
    finalizationFails: true,
  }, 1, 1);

  const recoveryFailureFixture = makeFixture({
    writeFails: true,
    recoveryFails: true,
  });

  await assert.rejects(
    recoveryFailureFixture.run(),
    /Rollback outcome is uncertain/
  );

  const recoveryFailureState = recoveryFailureFixture.getState();
  assert.equal(
    recoveryFailureState.executionState,
    "SUBMITTED",
    "If recovery persistence fails, the claim may remain SUBMITTED"
  );
  assert.equal(
    recoveryFailureState.rollbackEvent,
    null,
    "The recovery audit cannot be guaranteed when its transaction fails"
  );
  assert.equal(recoveryFailureState.writeCalls, 1);

  console.log("[PASS] Recovery persistence failure is surfaced without retry");

  const fixture = makeFixture();
  const results = await Promise.allSettled([
    fixture.run(),
    fixture.run(),
  ]);

  const state = fixture.getState();

  assert.equal(
    results.filter((r) => r.status === "fulfilled").length,
    1,
    "Exactly one concurrent rollback should succeed"
  );
  assert.equal(
    results.filter((r) => r.status === "rejected").length,
    1,
    "The competing rollback should be rejected"
  );
  assert.equal(state.writeCalls, 1, "Only one external write is allowed");
  assert.equal(state.executionState, "VERIFIED_SUCCESS");
  assert.equal(state.rollbackEvent?.executionResult, "SUCCESS");

  console.log("[PASS] Concurrent rollback permits only one write");
  console.log("\nAll isolated rollback recovery tests passed.");
}

main().catch((error) => {
  console.error("\nRollback recovery tests failed:", error);
  process.exitCode = 1;
});
