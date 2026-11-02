import assert from "node:assert/strict";
import {
  persistSearchTermRecommendation,
  type PersistSearchTermRecommendationInput,
  type RecommendationStore,
} from "../src/lib/services/search-term-recommendation.persistence";

type Row = {
  id: string;
  amazonAccountId: string;
  searchTermId: string;
  idempotencyKey: string;
  productId: string | null;
  status: string;
  executionState: string;
  approvalStatus: string;
  title: string;
};

const ACCOUNT = "acct-1";
const PRODUCT = "prod-1";
const TERM = "term-1";
const KEY = `search-term:${ACCOUNT}:${TERM}:WASTE:ADD_NEGATIVE_KEYWORD`;

function input(title: string): PersistSearchTermRecommendationInput {
  return {
    amazonAccountId: ACCOUNT,
    productId: PRODUCT,
    searchTermId: TERM,
    idempotencyKey: KEY,
    refreshData: { title },
    createData: {
      amazonAccountId: ACCOUNT,
      productId: PRODUCT,
      searchTermId: TERM,
      idempotencyKey: KEY,
      title,
      status: "PENDING",
      executionState: "PENDING",
      approvalStatus: "PENDING",
    },
  };
}

/**
 * In-memory store that behaves like the database for the operations the
 * helper uses, including the (amazonAccountId, idempotencyKey) unique index
 * and atomic state-filtered updateMany.
 */
function createStore(hooks: {
  beforeUpdateMany?: (rows: Row[]) => void;
  afterFirstFindFirst?: (rows: Row[]) => void;
} = {}) {
  const rows: Row[] = [];
  let seq = 0;
  let findCalls = 0;
  let updateCalls = 0;

  const store: RecommendationStore = {
    findFirst: async (args) => {
      findCalls++;
      const where = args.where as {
        idempotencyKey: string;
        amazonAccountId: string;
        searchTermId: string;
      };
      const found = rows.find(
        (r) =>
          r.idempotencyKey === where.idempotencyKey &&
          r.amazonAccountId === where.amazonAccountId &&
          r.searchTermId === where.searchTermId
      );
      const snapshot = found ? { ...found } : null;
      if (findCalls === 1) hooks.afterFirstFindFirst?.(rows);
      return snapshot;
    },
    updateMany: async (args) => {
      updateCalls++;
      hooks.beforeUpdateMany?.(rows);
      const where = args.where as {
        id: string;
        status: string;
        executionState: string;
        approvalStatus: string;
      };
      const row = rows.find(
        (r) =>
          r.id === where.id &&
          r.status === where.status &&
          r.executionState === where.executionState &&
          r.approvalStatus === where.approvalStatus
      );
      if (!row) return { count: 0 };
      Object.assign(row, args.data as Partial<Row>);
      return { count: 1 };
    },
    create: async (args) => {
      const data = args.data as Omit<Row, "id">;
      const duplicate = rows.some(
        (r) =>
          r.amazonAccountId === data.amazonAccountId &&
          r.idempotencyKey === data.idempotencyKey
      );
      if (duplicate) {
        throw Object.assign(new Error("Unique constraint failed"), {
          code: "P2002",
        });
      }
      const row: Row = { id: `rec-${++seq}`, ...data };
      rows.push(row);
      return { id: row.id };
    },
  };

  return { store, rows, counts: () => ({ findCalls, updateCalls }) };
}

async function main() {
  console.log("Test 1: first run creates, second run refreshes PENDING row");
  {
    const { store, rows } = createStore();
    const a = await persistSearchTermRecommendation(store, input("v1"));
    assert.equal(a.outcome, "CREATED");
    const b = await persistSearchTermRecommendation(store, input("v2"));
    assert.equal(b.outcome, "REFRESHED");
    assert.equal(rows.length, 1, "Exactly one row must exist");
    assert.equal(rows[0].title, "v2", "Pending row must be refreshed");
  }
  console.log("PASS");

  console.log("Test 2: non-pending history is never rewritten or resurrected");
  const nonPending: Array<Partial<Row>> = [
    { status: "EXECUTED", executionState: "VERIFIED_SUCCESS", approvalStatus: "APPROVED" },
    { status: "APPROVED", executionState: "PENDING", approvalStatus: "APPROVED" },
    { status: "REJECTED", executionState: "PENDING", approvalStatus: "REJECTED" },
    { status: "IGNORED", executionState: "PENDING", approvalStatus: "REJECTED" },
    { status: "LOCKED", executionState: "PENDING", approvalStatus: "REJECTED" },
    { status: "PENDING", executionState: "SUBMITTED", approvalStatus: "PENDING" },
    { status: "PENDING", executionState: "UNKNOWN", approvalStatus: "PENDING" },
    { status: "PENDING", executionState: "PENDING", approvalStatus: "APPROVED" },
  ];
  for (const state of nonPending) {
    const { store, rows, counts } = createStore();
    await persistSearchTermRecommendation(store, input("original"));
    Object.assign(rows[0], state);
    const before = { ...rows[0] };

    const result = await persistSearchTermRecommendation(store, input("changed"));

    assert.equal(result.outcome, "SKIPPED_NON_PENDING", JSON.stringify(state));
    assert.deepEqual(rows[0], before, `History rewritten for ${JSON.stringify(state)}`);
    assert.equal(rows.length, 1, "No new row may be created for a non-pending key");
    assert.equal(counts().updateCalls, 0, "No write may be attempted");
  }
  console.log(`PASS (${nonPending.length} states)`);

  console.log("Test 3: state change between lookup and refresh is not overwritten");
  {
    const { store, rows } = createStore({
      beforeUpdateMany: (r) => {
        // Seller approves/executes between our SELECT and our UPDATE.
        r[0].status = "EXECUTED";
        r[0].executionState = "VERIFIED_SUCCESS";
        r[0].approvalStatus = "APPROVED";
      },
    });
    await persistSearchTermRecommendation(store, input("original"));
    const result = await persistSearchTermRecommendation(store, input("changed"));
    assert.equal(result.outcome, "SKIPPED_STATE_CHANGED");
    assert.equal(rows[0].title, "original", "Concurrent transition must not be overwritten");
    assert.equal(rows[0].status, "EXECUTED");
  }
  console.log("PASS");

  console.log("Test 4: two concurrent creators yield exactly one row");
  {
    const { store, rows } = createStore();
    const results = await Promise.all([
      persistSearchTermRecommendation(store, input("worker-a")),
      persistSearchTermRecommendation(store, input("worker-b")),
    ]);
    assert.equal(rows.length, 1, "Unique index must prevent a duplicate row");
    const created = results.filter((r) => r.outcome === "CREATED").length;
    assert.equal(created, 1, "Exactly one worker may create");
    assert.equal(
      new Set(results.map((r) => r.recommendationId)).size,
      1,
      "Both workers must resolve to the same recommendation"
    );
  }
  console.log("PASS");

  console.log("Test 5: unique-conflict loser handles a winner that already moved on");
  {
    // Loser's first lookup sees nothing; before its insert the winner is
    // created AND executed. The loser must skip, not rewrite history.
    const { store, rows } = createStore({
      afterFirstFindFirst: (r) => {
        r.push({
          id: "winner",
          amazonAccountId: ACCOUNT,
          searchTermId: TERM,
          idempotencyKey: KEY,
          productId: PRODUCT,
          status: "EXECUTED",
          executionState: "VERIFIED_SUCCESS",
          approvalStatus: "APPROVED",
          title: "winner",
        });
      },
    });
    const result = await persistSearchTermRecommendation(store, input("loser"));
    assert.equal(result.outcome, "SKIPPED_NON_PENDING");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "winner");
    assert.equal(rows[0].status, "EXECUTED");
  }
  console.log("PASS");

  console.log("Test 6: non-unique errors propagate; conflicting product ownership throws");
  {
    const failing: RecommendationStore = {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
      create: async () => {
        throw new Error("connection reset");
      },
    };
    await assert.rejects(
      persistSearchTermRecommendation(failing, input("x")),
      /connection reset/
    );

    const { store, rows } = createStore();
    await persistSearchTermRecommendation(store, input("original"));
    rows[0].productId = "some-other-product";
    await assert.rejects(
      persistSearchTermRecommendation(store, input("x")),
      /conflicting product ownership/
    );
  }
  console.log("PASS");

  console.log("\nALL SEARCH-TERM IDEMPOTENCY TESTS PASSED");
}

main().catch((error) => {
  console.error("SEARCH-TERM IDEMPOTENCY TEST FAILED:", error);
  process.exitCode = 1;
});
