import { IAmazonConnector } from "./connector.interface";
import { AmazonAuthService, AMAZON_ENDPOINTS } from "./auth.service";
import { AmazonReportingService } from "./reporting.service";
import {
  AmazonCampaignSummary,
  AmazonCredentials,
  AmazonKeywordSummary,
  AmazonMarketplace,
  AmazonProfile,
  AmazonRequestMetadata,
  AmazonVerificationResult,
  AmazonWriteResponse,
  ConnectorMode,
} from "./types";

export class RealAmazonConnector implements IAmazonConnector {
  readonly mode: ConnectorMode = "REAL";
  private credentials: AmazonCredentials;

  constructor(credentials: AmazonCredentials) {
    this.credentials = credentials;
  }

  private getBaseUrl(): string {
    return AMAZON_ENDPOINTS.advertising[this.credentials.region];
  }

  private async makeRequest<T>(
    path: string,
    options: {
      method: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      profileId?: string;
      contentType?: string;
    }
  ): Promise<{ data: T; metadata: AmazonRequestMetadata }> {
    const token = await AmazonAuthService.getAccessToken(this.credentials);
    const url = `${this.getBaseUrl()}${path}`;
    const startTime = Date.now();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": this.credentials.clientId,
      "Content-Type": options.contentType || "application/json",
      Accept: "application/json",
    };

    const effectiveProfileId = options.profileId || this.credentials.profileId;
    if (effectiveProfileId) {
      headers["Amazon-Advertising-API-Scope"] = effectiveProfileId;
    }

    const res = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const latencyMs = Date.now() - startTime;
    const requestId = res.headers.get("x-amz-request-id") || `amz-req-${Date.now()}`;
    const rateLimitRemaining = res.headers.has("x-amzn-ratelimit-remaining")
      ? Number(res.headers.get("x-amzn-ratelimit-remaining"))
      : undefined;
    const retryAfter = res.headers.has("retry-after")
      ? Number(res.headers.get("retry-after"))
      : undefined;

    const metadata: AmazonRequestMetadata = {
      requestId,
      timestamp: new Date().toISOString(),
      endpoint: path,
      method: options.method,
      statusCode: res.status,
      latencyMs,
      rateLimitRemaining,
      rateLimitResetSeconds: retryAfter,
    };

    if (res.status === 429) {
      throw new Error(
        `Amazon Ads API Throttled (429). Retry-After: ${retryAfter || 5}s. RequestId: ${requestId}`
      );
    }

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(
        `Amazon Ads API error (${res.status}) on ${options.method} ${path}: ${errBody} (RequestId: ${requestId})`
      );
    }

    const data = (await res.json()) as T;
    return { data, metadata };
  }

  async getProfiles(): Promise<AmazonProfile[]> {
    return AmazonAuthService.discoverProfiles(this.credentials);
  }

  async getMarketplaces(): Promise<AmazonMarketplace[]> {
    // Current standard marketplaces for Amazon Advertising
    return [
      { id: "A21TJRUUN4KGV", countryCode: "IN", name: "Amazon India", endpoint: AMAZON_ENDPOINTS.advertising.eu, region: "eu" },
      { id: "ATVPDKIKX0DER", countryCode: "US", name: "Amazon US", endpoint: AMAZON_ENDPOINTS.advertising.na, region: "na" },
      { id: "A1F83G8C2ARO7P", countryCode: "UK", name: "Amazon UK", endpoint: AMAZON_ENDPOINTS.advertising.eu, region: "eu" },
      { id: "A1PA6795UKMFR9", countryCode: "DE", name: "Amazon DE", endpoint: AMAZON_ENDPOINTS.advertising.eu, region: "eu" },
    ];
  }

  async getCampaigns(profileId?: string): Promise<AmazonCampaignSummary[]> {
    const { data } = await this.makeRequest<any[]>("/sp/campaigns/list", {
      method: "POST",
      profileId,
      contentType: "application/vnd.spCampaign.v3+json",
      body: { stateFilter: { include: ["ENABLED", "PAUSED"] } },
    });

    return (data || []).map((c: any) => ({
      campaignId: c.campaignId,
      name: c.name,
      campaignType: "SPONSORED_PRODUCTS",
      targetingType: c.targetingType || "MANUAL",
      state: c.state,
      dailyBudget: c.budget?.budget || 0,
    }));
  }

  async getKeywords(profileId: string, campaignId: string): Promise<AmazonKeywordSummary[]> {
    const { data } = await this.makeRequest<any[]>("/sp/keywords/list", {
      method: "POST",
      profileId,
      contentType: "application/vnd.spKeyword.v3+json",
      body: { campaignIdFilter: { include: [campaignId] } },
    });

    return (data || []).map((k: any) => ({
      keywordId: k.keywordId,
      campaignId: k.campaignId,
      adGroupId: k.adGroupId,
      keywordText: k.keywordText,
      matchType: k.matchType,
      state: k.state,
      bid: k.bid || 0,
    }));
  }

  async getSearchTerms(
    options: {
      profileId: string;
      startDate: string;
      endDate: string;
    }
  ) {
    const reportingService = new AmazonReportingService(this.credentials);

    return reportingService.getSearchTerms(options);
  }

  async updateKeywordBid(
    profileId: string,
    params: { keywordId: string; newBid: number; previousBid: number }
  ): Promise<AmazonWriteResponse<{ keywordId: string; bid: number }>> {
    try {
      const { metadata } = await this.makeRequest<any>("/sp/keywords", {
        method: "PUT",
        profileId,
        contentType: "application/vnd.spKeyword.v3+json",
        body: {
          keywords: [
            {
              keywordId: params.keywordId,
              bid: params.newBid,
            },
          ],
        },
      });

      return {
        success: true,
        connectorMode: "REAL",
        executionState: "AMAZON_ACCEPTED",
        metadata,
        data: { keywordId: params.keywordId, bid: params.newBid },
      };
    } catch (err: any) {
      return {
        success: false,
        connectorMode: "REAL",
        executionState: "FAILED",
        error: err.message,
        metadata: {
          requestId: `err-${Date.now()}`,
          timestamp: new Date().toISOString(),
          endpoint: "/sp/keywords",
          method: "PUT",
          statusCode: 500,
          latencyMs: 0,
        },
      };
    }
  }

  async updateCampaignBudget(
    profileId: string,
    params: { campaignId: string; newBudget: number; previousBudget: number }
  ): Promise<AmazonWriteResponse<{ campaignId: string; dailyBudget: number }>> {
    try {
      const { metadata } = await this.makeRequest<any>("/sp/campaigns", {
        method: "PUT",
        profileId,
        contentType: "application/vnd.spCampaign.v3+json",
        body: {
          campaigns: [
            {
              campaignId: params.campaignId,
              budget: {
                budget: params.newBudget,
                budgetType: "DAILY",
              },
            },
          ],
        },
      });

      return {
        success: true,
        connectorMode: "REAL",
        executionState: "AMAZON_ACCEPTED",
        metadata,
        data: { campaignId: params.campaignId, dailyBudget: params.newBudget },
      };
    } catch (err: any) {
      return {
        success: false,
        connectorMode: "REAL",
        executionState: "FAILED",
        error: err.message,
        metadata: {
          requestId: `err-${Date.now()}`,
          timestamp: new Date().toISOString(),
          endpoint: "/sp/campaigns",
          method: "PUT",
          statusCode: 500,
          latencyMs: 0,
        },
      };
    }
  }

  async createNegativeKeyword(
    profileId: string,
    params: {
      campaignId: string;
      keywordText: string;
      matchType: "NEGATIVE_EXACT" | "NEGATIVE_PHRASE";
    }
  ): Promise<AmazonWriteResponse<{ keywordId: string; keywordText: string }>> {
    const { data, metadata } = await this.makeRequest<any>("/sp/negativeKeywords", {
      method: "POST",
      profileId,
      contentType: "application/vnd.spNegativeKeyword.v3+json",
      body: {
        negativeKeywords: [
          {
            campaignId: params.campaignId,
            keywordText: params.keywordText,
            matchType: params.matchType,
            state: "ENABLED",
          },
        ],
      },
    });

    const createdId = data?.negativeKeywords?.[0]?.keywordId || `amz-neg-${Date.now()}`;
    return {
      success: true,
      connectorMode: "REAL",
      executionState: "AMAZON_ACCEPTED",
      metadata,
      data: { keywordId: createdId, keywordText: params.keywordText },
    };
  }

  async createKeyword(
    profileId: string,
    params: {
      campaignId: string;
      keywordText: string;
      matchType: "EXACT" | "PHRASE" | "BROAD";
      bid: number;
    }
  ): Promise<AmazonWriteResponse<{ keywordId: string; keywordText: string; bid: number }>> {
    const { data, metadata } = await this.makeRequest<any>("/sp/keywords", {
      method: "POST",
      profileId,
      contentType: "application/vnd.spKeyword.v3+json",
      body: {
        keywords: [
          {
            campaignId: params.campaignId,
            keywordText: params.keywordText,
            matchType: params.matchType,
            state: "ENABLED",
            bid: params.bid,
          },
        ],
      },
    });

    const createdId = data?.keywords?.[0]?.keywordId || `amz-kw-${Date.now()}`;
    return {
      success: true,
      connectorMode: "REAL",
      executionState: "AMAZON_ACCEPTED",
      metadata,
      data: { keywordId: createdId, keywordText: params.keywordText, bid: params.bid },
    };
  }

  /**
   * Real post-write read-back verification:
   * Reads the current keyword value from Amazon's API to confirm it matches expected value.
   */
  async verifyKeywordBid(
    profileId: string,
    keywordId: string,
    expectedBid: number
  ): Promise<AmazonVerificationResult> {
    const { data, metadata } = await this.makeRequest<any>(`/sp/keywords/${keywordId}`, {
      method: "GET",
      profileId,
    });

    const actualBid = Number(data?.bid ?? -1);
    const verified = Math.abs(actualBid - expectedBid) < 0.001;

    return {
      verified,
      connectorMode: "REAL",
      entityType: "keyword_bid",
      entityId: keywordId,
      expectedValue: expectedBid,
      actualAmazonValue: actualBid,
      verifiedAt: new Date().toISOString(),
      metadata,
      message: verified
        ? `Amazon confirmed keyword bid is verified at ₹${actualBid.toFixed(2)}.`
        : `Amazon read-back mismatch: expected ₹${expectedBid.toFixed(2)}, got ₹${actualBid.toFixed(2)}.`,
    };
  }

  async verifyCampaignBudget(
    profileId: string,
    campaignId: string,
    expectedBudget: number
  ): Promise<AmazonVerificationResult> {
    const { data, metadata } = await this.makeRequest<any>(`/sp/campaigns/${campaignId}`, {
      method: "GET",
      profileId,
    });

    const actualBudget = Number(data?.budget?.budget ?? -1);
    const verified = Math.abs(actualBudget - expectedBudget) < 0.001;

    return {
      verified,
      connectorMode: "REAL",
      entityType: "campaign_budget",
      entityId: campaignId,
      expectedValue: expectedBudget,
      actualAmazonValue: actualBudget,
      verifiedAt: new Date().toISOString(),
      metadata,
      message: verified
        ? `Amazon confirmed campaign budget is verified at ₹${actualBudget.toFixed(2)}.`
        : `Amazon read-back mismatch: expected ₹${expectedBudget.toFixed(2)}, got ₹${actualBudget.toFixed(2)}.`,
    };
  }
}

