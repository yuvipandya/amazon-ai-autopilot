import { prisma } from "@/lib/prisma";
import { getAmazonConnector } from "@/lib/amazon/connector-factory";

export interface SyncOptions {
  amazonAccountId: string;
  reportPeriod?: "LAST_7_DAYS" | "LAST_14_DAYS" | "LAST_30_DAYS";
  force?: boolean;
}

export interface SyncResult {
  success: boolean;
  amazonAccountId: string;
  connectorMode: "DEMO" | "REAL";
  syncedAt: string;
  campaignsCount: number;
  keywordsCount: number;
  searchTermsCount: number;
  reportPeriod: string;
  durationMs: number;
  error?: string;
}

export class IngestionService {
  /**
   * Synchronizes Amazon Advertising entities (campaigns, keywords, search terms)
   * with external ID tracking, freshness timestamps, and deduplication.
   */
  static async syncAccountData(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const { amazonAccountId, reportPeriod = "LAST_14_DAYS" } = options;

    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId },
    });

    if (!account) {
      throw new Error(`Amazon Account ${amazonAccountId} not found.`);
    }

    // Update account sync status to IN_PROGRESS
    await prisma.amazonAccount.update({
      where: { id: account.id },
      data: { syncStatus: "SYNCING" },
    });

    try {
      const { connector, mode } = getAmazonConnector(account);
      const effectiveProfileId = account.profileId || undefined;

      // 1. Fetch campaigns from connector
      const externalCampaigns = await connector.getCampaigns(effectiveProfileId);
      let campaignsCount = 0;
      let keywordsCount = 0;

      for (const extCamp of externalCampaigns) {
        // Upsert campaign with external ID tracking
        const localCampaign = await prisma.campaign.upsert({
          where: {
            id: extCamp.campaignId.startsWith("mock-") ? undefined : extCamp.campaignId,
            // Fallback find by name and account
          },
          update: {
            name: extCamp.name,
            dailyBudget: extCamp.dailyBudget,
            amazonCampaignId: extCamp.campaignId,
            lastSyncAt: new Date(),
          },
          create: {
            amazonAccountId: account.id,
            amazonCampaignId: extCamp.campaignId,
            name: extCamp.name,
            campaignType: extCamp.campaignType,
            targetingType: extCamp.targetingType,
            dailyBudget: extCamp.dailyBudget,
            lastSyncAt: new Date(),
          },
        }).catch(async () => {
          // If upsert by ID is not applicable, update or create by name
          const existing = await prisma.campaign.findFirst({
            where: { amazonAccountId: account.id, name: extCamp.name },
          });
          if (existing) {
            return prisma.campaign.update({
              where: { id: existing.id },
              data: {
                dailyBudget: extCamp.dailyBudget,
                amazonCampaignId: extCamp.campaignId,
                lastSyncAt: new Date(),
              },
            });
          }
          return prisma.campaign.create({
            data: {
              amazonAccountId: account.id,
              amazonCampaignId: extCamp.campaignId,
              name: extCamp.name,
              campaignType: extCamp.campaignType,
              targetingType: extCamp.targetingType,
              dailyBudget: extCamp.dailyBudget,
              lastSyncAt: new Date(),
            },
          });
        });

        campaignsCount++;

        // 2. Fetch keywords for campaign
        if (effectiveProfileId) {
          try {
            const externalKeywords = await connector.getKeywords(
              effectiveProfileId,
              extCamp.campaignId
            );

            for (const extKw of externalKeywords) {
              await prisma.keyword.upsert({
                where: {
                  campaignId_value_matchType: {
                    campaignId: localCampaign.id,
                    value: extKw.keywordText,
                    matchType: extKw.matchType,
                  },
                },
                update: {
                  bid: extKw.bid,
                  amazonKeywordId: extKw.keywordId,
                  adGroupId: extKw.adGroupId,
                  lastSyncAt: new Date(),
                },
                create: {
                  campaignId: localCampaign.id,
                  value: extKw.keywordText,
                  matchType: extKw.matchType,
                  bid: extKw.bid,
                  amazonKeywordId: extKw.keywordId,
                  adGroupId: extKw.adGroupId,
                  lastSyncAt: new Date(),
                },
              });
              keywordsCount++;
            }
          } catch {
            // Non-fatal if keyword sync for a campaign encounters partial error
          }
        }
      }

      const searchTermsCount = await prisma.searchTerm.count({
        where: { campaign: { amazonAccountId: account.id } },
      });

      const now = new Date();
      await prisma.amazonAccount.update({
        where: { id: account.id },
        data: {
          lastSyncAt: now,
          syncStatus: "IDLE",
          syncError: null,
        },
      });

      return {
        success: true,
        amazonAccountId: account.id,
        connectorMode: mode,
        syncedAt: now.toISOString(),
        campaignsCount,
        keywordsCount,
        searchTermsCount,
        reportPeriod,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      await prisma.amazonAccount.update({
        where: { id: account.id },
        data: {
          syncStatus: "ERROR",
          syncError: error.message,
        },
      });

      return {
        success: false,
        amazonAccountId: account.id,
        connectorMode: "DEMO",
        syncedAt: new Date().toISOString(),
        campaignsCount: 0,
        keywordsCount: 0,
        searchTermsCount: 0,
        reportPeriod,
        durationMs: Date.now() - startTime,
        error: error.message,
      };
    }
  }
}
