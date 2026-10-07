import { prisma } from "@/lib/prisma";
import { getAmazonConnector } from "@/lib/amazon/connector-factory";
import { getAmazonReportingService } from "@/lib/amazon/reporting-factory";

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
      const reporting = getAmazonReportingService(account);
      const effectiveProfileId =
        account.profileId ||
        (account.isLiveAccount ? undefined : "mock-profile-in-001");

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

      // 3. Fetch and ingest Amazon search-term reporting data.
      // Amazon supports a maximum 31-day search-term report window.
      // Our sync periods are capped at 30 days, leaving a safety margin.
      let searchTermsCount = await prisma.searchTerm.count({
        where: { campaign: { amazonAccountId: account.id } },
      });

      if (effectiveProfileId) {
        const periodDays =
          reportPeriod === "LAST_7_DAYS"
            ? 7
            : reportPeriod === "LAST_30_DAYS"
              ? 30
              : 14;

        const endDate = new Date();
        endDate.setUTCDate(endDate.getUTCDate() - 1);

        const startDate = new Date(endDate);
        startDate.setUTCDate(startDate.getUTCDate() - (periodDays - 1));

        const formatDate = (date: Date) =>
          date.toISOString().slice(0, 10);

        const externalSearchTerms = await reporting.service.getSearchTerms({
          profileId: effectiveProfileId,
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
        });

        // The existing SearchTerm model is unique by campaign + value,
        // so aggregate DAILY Amazon rows before persisting them.
        const aggregated = new Map<
          string,
          {
            campaignId: string;
            searchTerm: string;
            amazonSearchTermId: string;
            impressions: number;
            clicks: number;
            orders: number;
            spend: number;
            sales: number;
            queryCount: number;
          }
        >();

        for (const row of externalSearchTerms) {
          const key = `${row.campaignId}:${row.searchTerm}`;

          const current = aggregated.get(key);

          if (!current) {
            aggregated.set(key, {
              campaignId: row.campaignId,
              searchTerm: row.searchTerm,
              amazonSearchTermId: row.amazonSearchTermId,
              impressions: row.impressions,
              clicks: row.clicks,
              orders: row.orders,
              spend: row.spend,
              sales: row.sales,
              queryCount: 1,
            });
          } else {
            current.impressions += row.impressions;
            current.clicks += row.clicks;
            current.orders += row.orders;
            current.spend += row.spend;
            current.sales += row.sales;
            current.queryCount += 1;
          }
        }

        for (const item of aggregated.values()) {
          const localCampaign = await prisma.campaign.findFirst({
            where: {
              amazonAccountId: account.id,
              amazonCampaignId: item.campaignId,
            },
          });

          if (!localCampaign) {
            continue;
          }

          const acos =
            item.sales > 0
              ? item.spend / item.sales
              : item.spend > 0
                ? 1
                : 0;

          await prisma.searchTerm.upsert({
            where: {
              campaignId_value: {
                campaignId: localCampaign.id,
                value: item.searchTerm,
              },
            },
            update: {
              amazonSearchTermId: item.amazonSearchTermId,
              impressions: item.impressions,
              clicks: item.clicks,
              orders: item.orders,
              spend: item.spend,
              sales: item.sales,
              acos,
              queryCount: item.queryCount,
            },
            create: {
              campaignId: localCampaign.id,
              amazonSearchTermId: item.amazonSearchTermId,
              value: item.searchTerm,
              impressions: item.impressions,
              clicks: item.clicks,
              orders: item.orders,
              spend: item.spend,
              sales: item.sales,
              acos,
              queryCount: item.queryCount,
            },
          });
        }

        searchTermsCount = await prisma.searchTerm.count({
          where: { campaign: { amazonAccountId: account.id } },
        });
      }

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



