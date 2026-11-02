import assert from "node:assert/strict";
import { RealAmazonConnector } from "../src/lib/amazon/real-connector";

/**
 * OFFLINE contract tests for RealAmazonConnector.
 *
 * These use a mocked global fetch. They verify how the code builds requests and
 * parses the Amazon Ads API v3 response shapes it expects. They do NOT prove
 * anything about the live Amazon API: that requires a controlled run with real
 * credentials (see the handoff notes).
 */

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

const calls: Call[] = [];
let tokenRequests = 0;
let handler: (call: Call) => { status?: number; body: unknown } = () => ({
  body: {},
});

globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const url = String(input);

  if (url.includes("/auth/o2/token")) {
    tokenRequests++;
    return new Response(
      JSON.stringify({ access_token: `tok-${tokenRequests}`, expires_in: 3600 }),
      { status: 200 }
    );
  }

  const call: Call = {
    url,
    method: String(init?.method ?? "GET"),
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
  calls.push(call);

  const res = handler(call);
  return new Response(JSON.stringify(res.body), {
    status: res.status ?? 200,
    headers: { "x-amz-request-id": `req-${calls.length}` },
  });
}) as typeof fetch;

function connector(refreshToken = "refresh-A") {
  return new RealAmazonConnector({
    clientId: "client-1",
    clientSecret: "secret",
    refreshToken,
    profileId: "1234567890",
    region: "eu",
  });
}

function reset(h: typeof handler = () => ({ body: {} })) {
  calls.length = 0;
  handler = h;
}

async function main() {
  console.log("Test 1: vendor Accept header and real profile scope");
  {
    reset(() => ({ body: { campaigns: [] } }));
    await connector().getCampaigns("default-profile");
    const c = calls[0];
    assert.equal(c.headers["Content-Type"], "application/vnd.spCampaign.v3+json");
    assert.equal(
      c.headers["Accept"],
      "application/vnd.spCampaign.v3+json",
      "Accept must match the v3 vendor type"
    );
    assert.equal(
      c.headers["Amazon-Advertising-API-Scope"],
      "1234567890",
      'The "default-profile" placeholder must never be sent as scope'
    );
    assert.equal(c.headers["Amazon-Advertising-API-ClientId"], "client-1");
  }
  console.log("PASS");

  console.log("Test 2: wrapped list response with nextToken pagination");
  {
    reset((call) => {
      const token = (call.body as { nextToken?: string }).nextToken;
      return token
        ? {
            body: {
              campaigns: [
                { campaignId: 2, name: "B", state: "PAUSED", budget: { budget: 20 } },
              ],
            },
          }
        : {
            body: {
              campaigns: [
                { campaignId: 1, name: "A", state: "ENABLED", budget: { budget: 10 } },
              ],
              nextToken: "page-2",
            },
          };
    });
    const campaigns = await connector().getCampaigns();
    assert.deepEqual(
      campaigns.map((c) => [c.campaignId, c.dailyBudget]),
      [["1", 10], ["2", 20]]
    );
    assert.equal(calls.length, 2, "Both pages must be requested");
  }
  console.log("PASS");

  console.log("Test 3: bare-array list responses are still tolerated");
  {
    reset(() => ({
      body: [{ keywordId: 9, campaignId: 1, keywordText: "x", matchType: "EXACT", state: "ENABLED", bid: 1.5 }],
    }));
    const kws = await connector().getKeywords("1234567890", "1");
    assert.equal(kws.length, 1);
    assert.equal(kws[0].bid, 1.5);
  }
  console.log("PASS");

  console.log("Test 4: HTTP 207 per-item errors are failures, not successes");
  {
    reset(() => ({
      status: 207,
      body: { keywords: { success: [], error: [{ index: 0, errors: [{ errorType: "INVALID_BID" }] }] } },
    }));
    const failed = await connector().updateKeywordBid("1234567890", {
      keywordId: "9",
      newBid: 1.1,
      previousBid: 1,
    });
    assert.equal(failed.success, false);
    assert.match(String(failed.error), /INVALID_BID/);

    reset(() => ({
      status: 207,
      body: { keywords: { success: [{ index: 0, keywordId: "9" }], error: [] } },
    }));
    const ok = await connector().updateKeywordBid("1234567890", {
      keywordId: "9",
      newBid: 1.1,
      previousBid: 1,
    });
    assert.equal(ok.success, true);

    reset(() => ({
      status: 207,
      body: { campaigns: { success: [], error: [{ index: 0, errors: [{ errorType: "BAD_BUDGET" }] }] } },
    }));
    const budget = await connector().updateCampaignBudget("1234567890", {
      campaignId: "1",
      newBudget: 5,
      previousBudget: 4,
    });
    assert.equal(budget.success, false);
  }
  console.log("PASS");

  console.log("Test 5: keyword/negative creation never fabricates an ID");
  {
    reset(() => ({
      status: 207,
      body: { keywords: { success: [{ index: 0, keywordId: "555" }], error: [] } },
    }));
    const created = await connector().createKeyword("1234567890", {
      campaignId: "1",
      keywordText: "term",
      matchType: "EXACT",
      bid: 1,
    });
    assert.equal(created.success, true);
    assert.equal(created.data?.keywordId, "555");

    for (const body of [
      { keywords: { success: [], error: [{ index: 0, errors: [{ errorType: "DUPLICATE" }] }] } },
      {},
    ]) {
      reset(() => ({ status: 207, body }));
      const res = await connector().createKeyword("1234567890", {
        campaignId: "1",
        keywordText: "term",
        matchType: "EXACT",
        bid: 1,
      });
      assert.equal(res.success, false, "Unconfirmed creation must fail");
      assert.equal(res.data, undefined, "No fabricated keyword ID");
    }

    reset(() => ({
      status: 207,
      body: { negativeKeywords: { success: [{ index: 0, negativeKeywordId: "n-1" }], error: [] } },
    }));
    const neg = await connector().createNegativeKeyword("1234567890", {
      campaignId: "1",
      keywordText: "bad term",
      matchType: "NEGATIVE_EXACT",
    });
    assert.equal(neg.success, true);
    assert.equal(neg.data?.keywordId, "n-1");

    reset(() => ({
      status: 207,
      body: { negativeKeywords: { success: [], error: [{ index: 0, errors: [] }] } },
    }));
    const negFail = await connector().createNegativeKeyword("1234567890", {
      campaignId: "1",
      keywordText: "bad term",
      matchType: "NEGATIVE_EXACT",
    });
    assert.equal(negFail.success, false);
  }
  console.log("PASS");

  console.log("Test 6: read-back verification uses the v3 list endpoint");
  {
    reset(() => ({ body: { keywords: [{ keywordId: "9", campaignId: "1", bid: 1.1 }] } }));
    const match = await connector().verifyKeywordBid("1234567890", "9", 1.1);
    assert.equal(match.verified, true);
    assert.equal(calls[0].method, "POST");
    assert.ok(calls[0].url.endsWith("/sp/keywords/list"));
    assert.deepEqual(
      (calls[0].body as { keywordIdFilter: unknown }).keywordIdFilter,
      { include: ["9"] }
    );
    assert.ok(
      !calls.some((c) => c.method === "GET"),
      "No GET-by-id calls: v3 does not provide them"
    );

    reset(() => ({ body: { keywords: [{ keywordId: "9", bid: 2 }] } }));
    assert.equal((await connector().verifyKeywordBid("1234567890", "9", 1.1)).verified, false);

    reset(() => ({ body: { keywords: [] } }));
    assert.equal(
      (await connector().verifyKeywordBid("1234567890", "9", 1.1)).verified,
      false,
      "A keyword Amazon cannot find must not verify"
    );

    reset(() => ({ body: { campaigns: [{ campaignId: "1", budget: { budget: 5 } }] } }));
    assert.equal((await connector().verifyCampaignBudget("1234567890", "1", 5)).verified, true);

    reset(() => ({
      body: { keywords: [{ keywordId: "7", campaignId: "1", keywordText: "Term", matchType: "EXACT", bid: 1 }] },
    }));
    const creation = await connector().verifyKeywordCreation("1234567890", {
      campaignId: "1",
      keywordId: "7",
      keywordText: "term",
      matchType: "EXACT",
      expectedBid: 1,
    });
    assert.equal(creation.verified, true);
  }
  console.log("PASS");

  console.log("Test 7: access tokens are not shared across different refresh tokens");
  {
    reset(() => ({ body: { campaigns: [] } }));
    const before = tokenRequests;
    await connector("refresh-seller-1").getCampaigns();
    await connector("refresh-seller-2").getCampaigns();
    assert.equal(
      tokenRequests - before,
      2,
      "Two sellers sharing one LWA client ID must each get their own token"
    );
    const t1 = calls[0].headers["Authorization"];
    const t2 = calls[1].headers["Authorization"];
    assert.notEqual(t1, t2);
  }
  console.log("PASS");

  console.log("\nALL AMAZON CONNECTOR V3 CONTRACT TESTS PASSED (offline, mocked fetch)");
}

main().catch((error) => {
  console.error("AMAZON CONNECTOR V3 TEST FAILED:", error);
  process.exitCode = 1;
});
