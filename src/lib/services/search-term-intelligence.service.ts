import { prisma } from "@/lib/prisma";
import {
  classifySearchTerm,
  SearchTermAnalysis,
} from "@/lib/engines/search-term-intelligence";

export interface ClassifiedSearchTerm extends SearchTermAnalysis {
  id: string;
  campaignId: string;
  value: string;
}

export class SearchTermIntelligenceService {
  static async analyzeAccount(
    amazonAccountId: string
  ): Promise<ClassifiedSearchTerm[]> {
    const searchTerms = await prisma.searchTerm.findMany({
      where: {
        campaign: {
          amazonAccountId,
        },
      },
      select: {
        id: true,
        campaignId: true,
        value: true,
        impressions: true,
        clicks: true,
        orders: true,
        spend: true,
        sales: true,
        acos: true,
      },
    });

    const results: ClassifiedSearchTerm[] = [];

    for (const term of searchTerms) {
      const analysis = classifySearchTerm({
        impressions: term.impressions,
        clicks: term.clicks,
        orders: term.orders,
        spend: term.spend,
        sales: term.sales,
        acos: term.acos,
      });

      await prisma.searchTerm.update({
        where: {
          id: term.id,
        },
        data: {
          classification: analysis.classification,
          acos: analysis.acos,
        },
      });

      results.push({
        id: term.id,
        campaignId: term.campaignId,
        value: term.value,
        ...analysis,
      });
    }

    return results;
  }
}
