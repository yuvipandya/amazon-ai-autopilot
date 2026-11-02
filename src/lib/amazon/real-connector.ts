
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

type CampaignApiRecord = {
  campaignId?: string | number;
  name?: string;
  targetingType?: string;
  state?: string;
  budget?: { budget?: number | string };
};

type KeywordApiRecord = {
  keywordId?: string | number;
  campaignId?: string | number;
  adGroupId?: string | number;
  keywordText?: string;
  matchType?: string;
  state?: string;
  bid?: number | string;
};

/**
 * Amazon Ads API v3 list endpoints return an object such as
 * { campaigns: [...], nextToken, totalResults }. A bare array is also
 * tolerated so the parser does not break on either shape.
 */
type ListApiResponse<T> =
  | T[]
  | ({ nextToken?: string | null } & Record<string, unknown>);

/**
 * v3 create/update endpoints respond HTTP 207 with per-item results:
 * { keywords: { success: [{ index, keywordId }], error: [{ index, errors }] } }
 * An HTTP 2xx therefore does NOT prove that the item was accepted.
 */
type BatchItemResult = {
  index?: number;
  keywordId?: string | number;
  negativeKeywordId?: string | number;
  campaignId?: string | number;
  errors?: unknown;
  errorType?: string;
  description?: string;
};

type BatchApiResponse = Record<
  string,
  { success?: BatchItemResult[]; error?: BatchItemResult[] } | undefined
>;

const MAX_LIST_PAGES = 50;

/** Sentinel the execution engine uses when an account has no stored profileId. */
const UNSET_PROFILE_SENTINEL = "default-profile";

export function extractList<T>(
  data: ListApiResponse<T> | null | undefined,
  key: string
): T[] {
  if (Array.isArray(data)) {
    return data;
  }

  const value = data?.[key];

  return Array.isArray(value) ? (value as T[]) : [];
}

export function parseBatchResult(
  data: BatchApiResponse | null | undefined,
  key: string
): { successes: BatchItemResult[]; errors: BatchItemResult[] } {
  const section = data?.[key];

  return {
    successes: Array.isArray(section?.success) ? section.success : [],
    errors: Array.isArray(section?.error) ? section.error : [],
  };
}

function describeBatchErrors(errors: BatchItemResult[]): string {
  return JSON.stringify(errors).slice(0, 500);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
      // v3 vendor media types require Accept to match Content-Type.
      Accept: options.contentType || "application/json",
    };

    // Never send the execution engine's "default-profile" placeholder as the
    // advertising scope; fall back to the credential's real profile.
    const requestedProfileId =
      options.profileId && options.profileId !== UNSET_PROFILE_SENTINEL
        ? options.profileId
        : undefined;

    const effectiveProfileId =
      requestedProfileId || this.credentials.profileId;

    if (effectiveProfileId) {
      headers["Amazon-Advertising-API-Scope"] = effectiveProfileId;
    }

    const res = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const latencyMs = Date.now() - startTime;
    const requestId =
      res.headers.get("x-amz-request-id") || `amz-req-${Date.now()}`;

    const rateLimitRemaining = res.headers.has(
      "x-amzn-ratelimit-remaining"
    )
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
        `Amazon Ads API Throttled (429). Retry-After: ${
          retryAfter || 5
        }s. RequestId: ${requestId}`
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
      {
        id: "A21TJRUUN4KGV",
        countryCode: "IN",
        name: "Amazon India",
        endpoint: AMAZON_ENDPOINTS.advertising.eu,
        region: "eu",
      },
      {
        id: "ATVPDKIKX0DER",
        countryCode: "US",
        name: "Amazon US",
        endpoint: AMAZON_ENDPOINTS.advertising.na,
        region: "na",
      },
      {
        id: "A1F83G8C2ARO7P",
        countryCode: "UK",
        name: "Amazon UK",
        endpoint: AMAZON_ENDPOINTS.advertising.eu,
        region: "eu",
      },
      {
        id: "A1PA6795UKMFR9",
        countryCode: "DE",
        name: "Amazon DE",
        endpoint: AMAZON_ENDPOINTS.advertising.eu,
        region: "eu",
      },
    ];
  }

  async getCampaigns(
    profileId?: string
  ): Promise<AmazonCampaignSummary[]> {
    const campaigns: CampaignApiRecord[] = [];
    let nextToken: string | undefined;

    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const { data } = await this.makeRequest<
        ListApiResponse<CampaignApiRecord>
      >("/sp/campaigns/list", {
        method: "POST",
        profileId,
        contentType: "application/vnd.spCampaign.v3+json",
        body: {
          stateFilter: { include: ["ENABLED", "PAUSED"] },
          ...(nextToken ? { nextToken } : {}),
        },
      });

      campaigns.push(...extractList<CampaignApiRecord>(data, "campaigns"));

      const token = Array.isArray(data) ? undefined : data?.nextToken;
      if (!token) break;
      nextToken = token;
    }

    return campaigns.map((c) => ({
      campaignId: String(c.campaignId ?? ""),
      name: String(c.name ?? ""),
      campaignType: "SPONSORED_PRODUCTS",
      targetingType: c.targetingType || "MANUAL",
      state: String(c.state ?? ""),
      dailyBudget: Number(c.budget?.budget ?? 0),
    }));
  }

  async getKeywords(
    profileId: string,
    campaignId: string
  ): Promise<AmazonKeywordSummary[]> {
    const keywords: KeywordApiRecord[] = [];
    let nextToken: string | undefined;

    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const { data } = await this.makeRequest<
        ListApiResponse<KeywordApiRecord>
      >("/sp/keywords/list", {
        method: "POST",
        profileId,
        contentType: "application/vnd.spKeyword.v3+json",
        body: {
          campaignIdFilter: { include: [campaignId] },
          ...(nextToken ? { nextToken } : {}),
        },
      });

      keywords.push(...extractList<KeywordApiRecord>(data, "keywords"));

      const token = Array.isArray(data) ? undefined : data?.nextToken;
      if (!token) break;
      nextToken = token;
    }

    return keywords.map((k) => ({
      keywordId: String(k.keywordId ?? ""),
      campaignId: String(k.campaignId ?? ""),
      adGroupId:
        k.adGroupId == null ? undefined : String(k.adGroupId),
      keywordText: String(k.keywordText ?? ""),
      matchType: String(k.matchType ?? ""),
      state: String(k.state ?? ""),
      bid: Number(k.bid ?? 0),
    }));
  }

  /**
   * v3 has no GET-by-id endpoint for keywords; read back through the list
   * endpoint with an id filter.
   */
  private async readKeywordById(
    profileId: string,
    keywordId: string
  ): Promise<{ record: KeywordApiRecord | undefined; metadata: AmazonRequestMetadata }> {
    const { data, metadata } = await this.makeRequest<
      ListApiResponse<KeywordApiRecord>
    >("/sp/keywords/list", {
      method: "POST",
      profileId,
      contentType: "application/vnd.spKeyword.v3+json",
      body: { keywordIdFilter: { include: [String(keywordId)] } },
    });

    const record = extractList<KeywordApiRecord>(data, "keywords").find(
      (k) => String(k.keywordId) === String(keywordId)
    );

    return { record, metadata };
  }

  private async readCampaignById(
    profileId: string,
    campaignId: string
  ): Promise<{ record: CampaignApiRecord | undefined; metadata: AmazonRequestMetadata }> {
    const { data, metadata } = await this.makeRequest<
      ListApiResponse<CampaignApiRecord>
    >("/sp/campaigns/list", {
      method: "POST",
      profileId,
      contentType: "application/vnd.spCampaign.v3+json",
      body: { campaignIdFilter: { include: [String(campaignId)] } },
    });

    const record = extractList<CampaignApiRecord>(data, "campaigns").find(
      (c) => String(c.campaignId) === String(campaignId)
    );

    return { record, metadata };
  }

  async getSearchTerms(
    options: {
      profileId: string;
      startDate: string;
      endDate: string;
    }
  ) {
    const reportingService = new AmazonReportingService(
      this.credentials
    );

    return reportingService.getSearchTerms(options);
  }

  async updateKeywordBid(
    profileId: string,
    params: {
      keywordId: string;
      newBid: number;
      previousBid: number;
    }
  ): Promise<AmazonWriteResponse<{ keywordId: string; bid: number }>> {
    try {
      const { data, metadata } = await this.makeRequest<BatchApiResponse>(
        "/sp/keywords",
        {
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
        }
      );

      const batch = parseBatchResult(data, "keywords");
      if (batch.errors.length > 0) {
        return {
          success: false,
          connectorMode: "REAL",
          executionState: "FAILED",
          error: `Amazon rejected the keyword bid update: ${describeBatchErrors(batch.errors)}`,
          metadata,
        };
      }

      return {
        success: true,
        connectorMode: "REAL",
        executionState: "AMAZON_ACCEPTED",
        metadata,
        data: {
          keywordId: params.keywordId,
          bid: params.newBid,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        connectorMode: "REAL",
        executionState: "FAILED",
        error: getErrorMessage(err),
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
    params: {
      campaignId: string;
      newBudget: number;
      previousBudget: number;
    }
  ): Promise<
    AmazonWriteResponse<{ campaignId: string; dailyBudget: number }>
  > {
    try {
      const { data, metadata } = await this.makeRequest<BatchApiResponse>(
        "/sp/campaigns",
        {
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
        }
      );

      const batch = parseBatchResult(data, "campaigns");
      if (batch.errors.length > 0) {
        return {
          success: false,
          connectorMode: "REAL",
          executionState: "FAILED",
          error: `Amazon rejected the campaign budget update: ${describeBatchErrors(batch.errors)}`,
          metadata,
        };
      }

      return {
        success: true,
        connectorMode: "REAL",
        executionState: "AMAZON_ACCEPTED",
        metadata,
        data: {
          campaignId: params.campaignId,
          dailyBudget: params.newBudget,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        connectorMode: "REAL",
        executionState: "FAILED",
        error: getErrorMessage(err),
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
  ): Promise<
    AmazonWriteResponse<{ keywordId: string; keywordText: string }>
  > {
    const { data, metadata } =
      await this.makeRequest<BatchApiResponse>(
        "/sp/negativeKeywords",
        {
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
        }
      );

    const batch = parseBatchResult(data, "negativeKeywords");
    const created = batch.successes[0];
    const createdRawId = created?.negativeKeywordId ?? created?.keywordId;

    if (batch.errors.length > 0 || createdRawId == null) {
      return {
        success: false,
        connectorMode: "REAL",
        executionState: "FAILED",
        error: `Amazon did not confirm the negative keyword: ${describeBatchErrors(batch.errors)}`,
        metadata,
      };
    }

    return {
      success: true,
      connectorMode: "REAL",
      executionState: "AMAZON_ACCEPTED",
      metadata,
      data: {
        keywordId: String(createdRawId),
        keywordText: params.keywordText,
      },
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
  ): Promise<
    AmazonWriteResponse<{
      keywordId: string;
      keywordText: string;
      bid: number;
    }>
  > {
    const { data, metadata } =
      await this.makeRequest<BatchApiResponse>(
        "/sp/keywords",
        {
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
        }
      );

    const batch = parseBatchResult(data, "keywords");
    const created = batch.successes[0];

    // Never fabricate an ID: without one Amazon did not confirm creation.
    if (batch.errors.length > 0 || created?.keywordId == null) {
      return {
        success: false,
        connectorMode: "REAL",
        executionState: "FAILED",
        error: `Amazon did not confirm the keyword creation: ${describeBatchErrors(batch.errors)}`,
        metadata,
      };
    }

    return {
      success: true,
      connectorMode: "REAL",
      executionState: "AMAZON_ACCEPTED",
      metadata,
      data: {
        keywordId: String(created.keywordId),
        keywordText: params.keywordText,
        bid: params.bid,
      },
    };
  }

  /**
   * Real post-write read-back verification:
   * Reads the current keyword value from Amazon's API to confirm it matches expected value.
   */
  async verifyKeywordCreation(
    profileId: string,
    params: {
      campaignId: string;
      keywordId: string;
      keywordText: string;
      matchType: "EXACT" | "PHRASE" | "BROAD";
      expectedBid: number;
    }
  ): Promise<AmazonVerificationResult> {
    const { record: data, metadata } = await this.readKeywordById(
      profileId,
      params.keywordId
    );

    const actualCampaignId = String(data?.campaignId ?? "");
    const actualKeywordText = String(data?.keywordText ?? "");
    const actualMatchType = String(data?.matchType ?? "").toUpperCase();
    const actualBid = Number(data?.bid ?? -1);

    const campaignMatches =
      actualCampaignId === params.campaignId;

    const textMatches =
      actualKeywordText.trim().toLowerCase() ===
      params.keywordText.trim().toLowerCase();

    const matchTypeMatches =
      actualMatchType === params.matchType;

    const bidMatches =
      Math.abs(actualBid - params.expectedBid) < 0.001;

    const verified =
      campaignMatches &&
      textMatches &&
      matchTypeMatches &&
      bidMatches;

    return {
      verified,
      connectorMode: "REAL",
      entityType: "keyword_creation",
      entityId: params.keywordId,
      expectedValue: params.expectedBid,
      actualAmazonValue: actualBid,
      verifiedAt: new Date().toISOString(),
      metadata,
      message: verified
        ? `Amazon confirmed keyword "${actualKeywordText}" was created in the expected campaign as ${actualMatchType} at ₹${actualBid.toFixed(2)}.`
        : `Amazon keyword creation verification failed: campaign=${campaignMatches}, text=${textMatches}, matchType=${matchTypeMatches}, bid=${bidMatches}.`,
    };
  }

  async verifyKeywordBid(
    profileId: string,
    keywordId: string,
    expectedBid: number
  ): Promise<AmazonVerificationResult> {
    const { record: data, metadata } = await this.readKeywordById(
      profileId,
      keywordId
    );

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
    const { record: data, metadata } = await this.readCampaignById(
      profileId,
      campaignId
    );

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
