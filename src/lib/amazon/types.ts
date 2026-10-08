export type ConnectorMode = "DEMO" | "REAL";

export type AmazonRegion = "na" | "eu" | "fe";

export interface AmazonCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  profileId: string;
  region: AmazonRegion;
}

export interface AmazonProfile {
  profileId: string;
  countryCode: string;
  currencyCode: string;
  timezone: string;
  accountInfo?: {
    marketplaceStringId?: string;
    sellerStringId?: string;
    name?: string;
    type?: string;
  };
}

export interface AmazonMarketplace {
  id: string;
  countryCode: string;
  name: string;
  endpoint: string;
  region: AmazonRegion;
}

export interface AmazonCampaignSummary {
  campaignId: string;
  name: string;
  campaignType: string;
  targetingType: string;
  state: string;
  dailyBudget: number;
}

export interface AmazonKeywordSummary {
  keywordId: string;
  campaignId: string;
  adGroupId?: string;
  keywordText: string;
  matchType: string;
  state: string;
  bid: number;
}

export interface AmazonSearchTermRow {
  date?: string;
  startDate?: string;
  endDate?: string;
  campaignId?: string | number;
  campaignName?: string;
  adGroupId?: string | number;
  adGroupName?: string;
  keywordId?: string | number;
  keyword?: string;
  keywordType?: string;
  matchType?: string;
  targeting?: string;
  searchTerm?: string;
  impressions?: number | string;
  clicks?: number | string;
  cost?: number | string;
  purchases1d?: number | string;
  purchases7d?: number | string;
  purchases14d?: number | string;
  sales1d?: number | string;
  sales7d?: number | string;
  sales14d?: number | string;
  unitsSoldClicks1d?: number | string;
  unitsSoldClicks7d?: number | string;
  unitsSoldClicks14d?: number | string;
}

export interface AmazonSearchTerm {
  amazonSearchTermId: string;
  campaignId: string;
  searchTerm: string;
  date?: string;
  keywordId?: string;
  adGroupId?: string;
  keyword?: string;
  keywordType?: string;
  matchType?: string;
  targeting?: string;
  impressions: number;
  clicks: number;
  orders: number;
  spend: number;
  sales: number;
}

export interface AmazonRequestMetadata {
  requestId: string;
  timestamp: string;
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  rateLimitRemaining?: number;
  rateLimitResetSeconds?: number;
}

export interface AmazonWriteResponse<T> {
  success: boolean;
  connectorMode: ConnectorMode;
  executionState: "AMAZON_ACCEPTED" | "FAILED";
  metadata: AmazonRequestMetadata;
  data?: T;
  error?: string;
}

export interface AmazonVerificationResult {
  verified: boolean;
  connectorMode: ConnectorMode;
  entityType:
    | "keyword_bid"
    | "keyword_creation"
    | "campaign_budget"
    | "negative_keyword"
    | "keyword";
  entityId: string;
  expectedValue: number;
  actualAmazonValue: number;
  verifiedAt: string;
  metadata: AmazonRequestMetadata;
  message: string;
}

export type ApprovalSource =
  | "HUMAN_APPROVAL"
  | "AUTOPILOT_POLICY";

export type ExecutionState =
  | "PENDING"
  | "SUBMITTED"
  | "AMAZON_ACCEPTED"
  | "VERIFIED_SUCCESS"
  | "FAILED"
  | "UNKNOWN";
