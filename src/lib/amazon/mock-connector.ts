import { IAmazonConnector } from "./connector.interface";
import {
  AmazonCampaignSummary,
  AmazonKeywordSummary,
  AmazonMarketplace,
  AmazonProfile,
  AmazonVerificationResult,
  AmazonWriteResponse,
  ConnectorMode,
} from "./types";

export class MockAmazonConnector implements IAmazonConnector {
  readonly mode: ConnectorMode = "DEMO";

  // In-memory simulation state for read-back verification in demo mode
  private keywordBids = new Map<string, number>();
  private createdKeywords = new Map<
    string,
    {
      campaignId: string;
      keywordText: string;
      matchType: "EXACT" | "PHRASE" | "BROAD";
      bid: number;
    }
  >();
  private campaignBudgets = new Map<string, number>();

  private generateMockRequestId(): string {
    return `mock-amz-req-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;
  }

  async getProfiles(): Promise<AmazonProfile[]> {
    return [
      {
        profileId: "mock-profile-in-001",
        countryCode: "IN",
        currencyCode: "INR",
        timezone: "Asia/Kolkata",
        accountInfo: {
          marketplaceStringId: "A21TJRUUN4KGV",
          sellerStringId: "DEMO-IN-001",
          name: "Demo Commerce India (DEMO MODE)",
          type: "seller",
        },
      },
    ];
  }

  async getMarketplaces(): Promise<AmazonMarketplace[]> {
    return [
      {
        id: "A21TJRUUN4KGV",
        countryCode: "IN",
        name: "Amazon India (Demo)",
        endpoint: "https://advertising-api-eu.amazon.com",
        region: "eu",
      },
      {
        id: "ATVPDKIKX0DER",
        countryCode: "US",
        name: "Amazon US (Demo)",
        endpoint: "https://advertising-api.amazon.com",
        region: "na",
      },
    ];
  }

  async getCampaigns(): Promise<AmazonCampaignSummary[]> {
    return [
      {
        campaignId: "mock-camp-001",
        name: "Kundan Choker - Auto (DEMO)",
        campaignType: "SPONSORED_PRODUCTS",
        targetingType: "AUTO",
        state: "ENABLED",
        dailyBudget: 500,
      },
      {
        campaignId: "mock-camp-002",
        name: "Kundan Choker - Manual Exact (DEMO)",
        campaignType: "SPONSORED_PRODUCTS",
        targetingType: "MANUAL",
        state: "ENABLED",
        dailyBudget: 600,
      },
    ];
  }

  async getKeywords(_profileId: string, campaignId: string): Promise<AmazonKeywordSummary[]> {
    return [
      {
        keywordId: "mock-kw-001",
        campaignId,
        keywordText: "kundan bridal necklace",
        matchType: "EXACT",
        state: "ENABLED",
        bid: 12.0,
      },
    ];
  }

  async getSearchTerms(
    _options: {
      profileId: string;
      startDate: string;
      endDate: string;
    }
  ) {
    return [
      {
        amazonSearchTermId: "mock-camp-001:kundan bridal necklace",
        campaignId: "mock-camp-001",
        searchTerm: "kundan bridal necklace",
        date: "2026-10-06",
        keywordId: "mock-kw-001",
        adGroupId: "mock-adgroup-001",
        keyword: "kundan bridal necklace",
        keywordType: "EXACT",
        matchType: "EXACT",
        targeting: "kundan bridal necklace",
        impressions: 1840,
        clicks: 74,
        orders: 8,
        spend: 412.5,
        sales: 6840,
      },
      {
        amazonSearchTermId: "mock-camp-001:bridal kundan necklace",
        campaignId: "mock-camp-001",
        searchTerm: "bridal kundan necklace",
        date: "2026-10-06",
        keywordId: "mock-kw-001",
        adGroupId: "mock-adgroup-001",
        keyword: "kundan bridal necklace",
        keywordType: "PHRASE",
        matchType: "PHRASE",
        targeting: "kundan bridal necklace",
        impressions: 960,
        clicks: 39,
        orders: 4,
        spend: 221,
        sales: 3020,
      },
      {
        amazonSearchTermId: "mock-camp-002:cheap imitation necklace",
        campaignId: "mock-camp-002",
        searchTerm: "cheap imitation necklace",
        date: "2026-10-06",
        keywordId: "mock-kw-001",
        adGroupId: "mock-adgroup-001",
        keyword: "kundan bridal necklace",
        keywordType: "BROAD",
        matchType: "BROAD",
        targeting: "kundan bridal necklace",
        impressions: 2210,
        clicks: 126,
        orders: 0,
        spend: 518,
        sales: 0,
      },
    ];
  }

  async updateKeywordBid(
    _profileId: string,
    params: { keywordId: string; newBid: number; previousBid: number }
  ): Promise<AmazonWriteResponse<{ keywordId: string; bid: number }>> {
    // Record in simulated Amazon state
    this.keywordBids.set(params.keywordId, params.newBid);
    const requestId = this.generateMockRequestId();

    return {
      success: true,
      connectorMode: "DEMO",
      executionState: "AMAZON_ACCEPTED",
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        endpoint: "/sp/keywords",
        method: "PUT",
        statusCode: 200,
        latencyMs: 120,
        rateLimitRemaining: 499,
        rateLimitResetSeconds: 1,
      },
      data: { keywordId: params.keywordId, bid: params.newBid },
    };
  }

  async updateCampaignBudget(
    _profileId: string,
    params: { campaignId: string; newBudget: number; previousBudget: number }
  ): Promise<AmazonWriteResponse<{ campaignId: string; dailyBudget: number }>> {
    this.campaignBudgets.set(params.campaignId, params.newBudget);
    const requestId = this.generateMockRequestId();

    return {
      success: true,
      connectorMode: "DEMO",
      executionState: "AMAZON_ACCEPTED",
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        endpoint: "/sp/campaigns",
        method: "PUT",
        statusCode: 200,
        latencyMs: 140,
        rateLimitRemaining: 498,
        rateLimitResetSeconds: 1,
      },
      data: { campaignId: params.campaignId, dailyBudget: params.newBudget },
    };
  }

  async createNegativeKeyword(
    _profileId: string,
    params: {
      campaignId: string;
      keywordText: string;
      matchType: "NEGATIVE_EXACT" | "NEGATIVE_PHRASE";
    }
  ): Promise<AmazonWriteResponse<{ keywordId: string; keywordText: string }>> {
    const keywordId = `mock-neg-kw-${Math.random().toString(36).substring(2, 8)}`;
    const requestId = this.generateMockRequestId();

    return {
      success: true,
      connectorMode: "DEMO",
      executionState: "AMAZON_ACCEPTED",
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        endpoint: "/sp/negativeKeywords",
        method: "POST",
        statusCode: 201,
        latencyMs: 110,
      },
      data: { keywordId, keywordText: params.keywordText },
    };
  }

  async createKeyword(
    _profileId: string,
    params: {
      campaignId: string;
      keywordText: string;
      matchType: "EXACT" | "PHRASE" | "BROAD";
      bid: number;
    }
  ): Promise<AmazonWriteResponse<{ keywordId: string; keywordText: string; bid: number }>> {
    const keywordId = `mock-harvest-kw-${Math.random().toString(36).substring(2, 8)}`;
    this.keywordBids.set(keywordId, params.bid);

    this.createdKeywords.set(keywordId, {
      campaignId: params.campaignId,
      keywordText: params.keywordText,
      matchType: params.matchType,
      bid: params.bid,
    });
    const requestId = this.generateMockRequestId();

    return {
      success: true,
      connectorMode: "DEMO",
      executionState: "AMAZON_ACCEPTED",
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        endpoint: "/sp/keywords",
        method: "POST",
        statusCode: 201,
        latencyMs: 130,
      },
      data: { keywordId, keywordText: params.keywordText, bid: params.bid },
    };
  }

  /**
   * Post-write verification in DEMO mode:
   * Simulates real Amazon read-back verification against the simulated Amazon memory state.
   */
    async verifyKeywordCreation(
    _profileId: string,
    params: {
      campaignId: string;
      keywordId: string;
      keywordText: string;
      matchType: "EXACT" | "PHRASE" | "BROAD";
      expectedBid: number;
    }
  ): Promise<AmazonVerificationResult> {
    const created = this.createdKeywords.get(params.keywordId);

    if (!created) {
      return {
        verified: false,
        connectorMode: "DEMO",
        entityType: "keyword_creation",
        entityId: params.keywordId,
        expectedValue: params.expectedBid,
        actualAmazonValue: -1,
        verifiedAt: new Date().toISOString(),
        metadata: {
          requestId: this.generateMockRequestId(),
          timestamp: new Date().toISOString(),
          endpoint: `/sp/keywords/${params.keywordId}`,
          method: "GET",
          statusCode: 404,
          latencyMs: 85,
        },
        message: "[DEMO FAILED] Created keyword was not found.",
      };
    }

    const campaignMatches =
      created.campaignId === params.campaignId;

    const textMatches =
      created.keywordText.trim().toLowerCase() ===
      params.keywordText.trim().toLowerCase();

    const matchTypeMatches =
      created.matchType === params.matchType;

    const bidMatches =
      Math.abs(created.bid - params.expectedBid) < 0.001;

    const verified =
      campaignMatches &&
      textMatches &&
      matchTypeMatches &&
      bidMatches;

    return {
      verified,
      connectorMode: "DEMO",
      entityType: "keyword_creation",
      entityId: params.keywordId,
      expectedValue: params.expectedBid,
      actualAmazonValue: created.bid,
      verifiedAt: new Date().toISOString(),
      metadata: {
        requestId: this.generateMockRequestId(),
        timestamp: new Date().toISOString(),
        endpoint: `/sp/keywords/${params.keywordId}`,
        method: "GET",
        statusCode: 200,
        latencyMs: 85,
      },
      message: verified
        ? `[DEMO VERIFIED] Keyword "${created.keywordText}" was created correctly as ${created.matchType} at ₹${created.bid.toFixed(2)}.`
        : "[DEMO FAILED] Created keyword does not match expected values.",
    };
  }
  async verifyKeywordBid(
    _profileId: string,
    keywordId: string,
    expectedBid: number
  ): Promise<AmazonVerificationResult> {
    const actualBid = this.keywordBids.get(keywordId) ?? expectedBid;
    const verified = Math.abs(actualBid - expectedBid) < 0.001;

    return {
      verified,
      connectorMode: "DEMO",
      entityType: "keyword_bid",
      entityId: keywordId,
      expectedValue: expectedBid,
      actualAmazonValue: actualBid,
      verifiedAt: new Date().toISOString(),
      metadata: {
        requestId: this.generateMockRequestId(),
        timestamp: new Date().toISOString(),
        endpoint: `/sp/keywords/${keywordId}`,
        method: "GET",
        statusCode: 200,
        latencyMs: 85,
      },
      message: verified
        ? `[DEMO VERIFIED] Mock Amazon Ads API read-back confirmed keyword bid is ₹${actualBid.toFixed(2)}.`
        : `[DEMO FAILED] Mock Amazon read-back mismatch: expected ₹${expectedBid.toFixed(2)}, got ₹${actualBid.toFixed(2)}.`,
    };
  }

  async verifyCampaignBudget(
    _profileId: string,
    campaignId: string,
    expectedBudget: number
  ): Promise<AmazonVerificationResult> {
    const actualBudget = this.campaignBudgets.get(campaignId) ?? expectedBudget;
    const verified = Math.abs(actualBudget - expectedBudget) < 0.001;

    return {
      verified,
      connectorMode: "DEMO",
      entityType: "campaign_budget",
      entityId: campaignId,
      expectedValue: expectedBudget,
      actualAmazonValue: actualBudget,
      verifiedAt: new Date().toISOString(),
      metadata: {
        requestId: this.generateMockRequestId(),
        timestamp: new Date().toISOString(),
        endpoint: `/sp/campaigns/${campaignId}`,
        method: "GET",
        statusCode: 200,
        latencyMs: 90,
      },
      message: verified
        ? `[DEMO VERIFIED] Mock Amazon Ads API read-back confirmed campaign budget is ₹${actualBudget.toFixed(2)}.`
        : `[DEMO FAILED] Mock Amazon read-back mismatch: expected ₹${expectedBudget.toFixed(2)}, got ₹${actualBudget.toFixed(2)}.`,
    };
  }
}

