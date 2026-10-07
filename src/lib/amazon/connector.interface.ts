import {
  AmazonCampaignSummary,
  AmazonKeywordSummary,
  AmazonMarketplace,
  AmazonProfile,
  AmazonVerificationResult,
  AmazonWriteResponse,
  ConnectorMode,
} from "./types";

export interface IAmazonConnector {
  readonly mode: ConnectorMode;

  getProfiles(): Promise<AmazonProfile[]>;
  getMarketplaces(): Promise<AmazonMarketplace[]>;

  getCampaigns(profileId?: string): Promise<AmazonCampaignSummary[]>;
  getKeywords(profileId: string, campaignId: string): Promise<AmazonKeywordSummary[]>;

  getSearchTerms(
    options: {
      profileId: string;
      startDate: string;
      endDate: string;
    }
  ): Promise<import("./types").AmazonSearchTerm[]>;

  updateKeywordBid(
    profileId: string,
    params: {
      keywordId: string;
      newBid: number;
      previousBid: number;
    }
  ): Promise<AmazonWriteResponse<{ keywordId: string; bid: number }>>;

  updateCampaignBudget(
    profileId: string,
    params: {
      campaignId: string;
      newBudget: number;
      previousBudget: number;
    }
  ): Promise<AmazonWriteResponse<{ campaignId: string; dailyBudget: number }>>;

  createNegativeKeyword(
    profileId: string,
    params: {
      campaignId: string;
      keywordText: string;
      matchType: "NEGATIVE_EXACT" | "NEGATIVE_PHRASE";
    }
  ): Promise<AmazonWriteResponse<{ keywordId: string; keywordText: string }>>;

  createKeyword(
    profileId: string,
    params: {
      campaignId: string;
      keywordText: string;
      matchType: "EXACT" | "PHRASE" | "BROAD";
      bid: number;
    }
  ): Promise<AmazonWriteResponse<{ keywordId: string; keywordText: string; bid: number }>>;

  verifyKeywordBid(
    profileId: string,
    keywordId: string,
    expectedBid: number
  ): Promise<AmazonVerificationResult>;

  verifyCampaignBudget(
    profileId: string,
    campaignId: string,
    expectedBudget: number
  ): Promise<AmazonVerificationResult>;
}

