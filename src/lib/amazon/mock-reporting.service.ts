import { IAmazonReportingService } from "./reporting.interface";
import { AmazonSearchTerm } from "./types";

export class MockAmazonReportingService implements IAmazonReportingService {
  async getSearchTerms(options: {
    profileId: string;
    startDate: string;
    endDate: string;
  }): Promise<AmazonSearchTerm[]> {
    if (!options.profileId) {
      throw new Error("Demo reporting requires a profileId.");
    }

    return [
      {
        amazonSearchTermId: "mock-st-001",
        campaignId: "mock-camp-001",
        searchTerm: "kundan bridal necklace",
        date: options.endDate,
        keywordId: "mock-kw-001",
        adGroupId: "mock-adgroup-001",
        keyword: "kundan bridal necklace",
        keywordType: "KEYWORD",
        matchType: "EXACT",
        targeting: "kundan bridal necklace",
        impressions: 1840,
        clicks: 92,
        orders: 7,
        spend: 410.5,
        sales: 2899,
      },
      {
        amazonSearchTermId: "mock-st-002",
        campaignId: "mock-camp-001",
        searchTerm: "kundan necklace for bride",
        date: options.endDate,
        keywordId: "mock-kw-001",
        adGroupId: "mock-adgroup-001",
        keyword: "kundan bridal necklace",
        keywordType: "KEYWORD",
        matchType: "EXACT",
        targeting: "kundan bridal necklace",
        impressions: 1260,
        clicks: 61,
        orders: 5,
        spend: 278.25,
        sales: 2199,
      },
      {
        amazonSearchTermId: "mock-st-003",
        campaignId: "mock-camp-002",
        searchTerm: "cheap imitation jewellery",
        date: options.endDate,
        keywordId: "mock-kw-002",
        adGroupId: "mock-adgroup-002",
        keyword: "bridal necklace",
        keywordType: "KEYWORD",
        matchType: "PHRASE",
        targeting: "bridal necklace",
        impressions: 970,
        clicks: 84,
        orders: 0,
        spend: 392.4,
        sales: 0,
      },
      {
        amazonSearchTermId: "mock-st-004",
        campaignId: "mock-camp-002",
        searchTerm: "gold necklace women",
        date: options.endDate,
        keywordId: "mock-kw-003",
        adGroupId: "mock-adgroup-002",
        keyword: "gold necklace",
        keywordType: "KEYWORD",
        matchType: "BROAD",
        targeting: "gold necklace",
        impressions: 2210,
        clicks: 103,
        orders: 3,
        spend: 515,
        sales: 1499,
      },
    ];
  }
}
