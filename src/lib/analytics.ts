import { prisma } from "./prisma";
import { calculateContributionEconomics, evaluateInventoryPpc } from "./engines/bi";

function safeDivide(a: number, b: number) {
  if (b === 0) {
    return 0;
  }
  return a / b;
}

export interface DashboardMetricsOptions {
  amazonAccountId?: string;
  organizationId?: string;
}

export async function getDashboardMetrics(options?: DashboardMetricsOptions) {
  // ---------------------------------------------
  // MULTI-ACCOUNT RESOLUTION & ISOLATION
  // ---------------------------------------------
  let account = null;

  if (options?.amazonAccountId) {
    account = await prisma.amazonAccount.findUnique({
      where: { id: options.amazonAccountId },
      include: { organization: true },
    });

    if (account && options.organizationId && account.organizationId !== options.organizationId) {
      throw new Error("Access denied: Amazon account does not belong to specified organization.");
    }
  }

  // Fallback to active account if not specified
  if (!account) {
    account = await prisma.amazonAccount.findFirst({
      where: {
        status: "ACTIVE",
      },
      include: { organization: true },
    });
  }

  if (!account) {
    throw new Error("No active Amazon account found");
  }

  // Fetch all accounts for multi-account selector
  const availableAccounts = await prisma.amazonAccount.findMany({
    select: {
      id: true,
      sellerName: true,
      marketplace: true,
      status: true,
      isLiveAccount: true,
      automationLevel: true,
      automationPaused: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // ---------------------------------------------
  // PERFORMANCE DATA
  // ---------------------------------------------
  const metrics = await prisma.performanceMetric.findMany({
    where: {
      product: {
        amazonAccountId: account.id,
      },
    },
    orderBy: {
      date: "asc",
    },
  });

  // ---------------------------------------------
  // CORE KPI CALCULATIONS
  // ---------------------------------------------
  const revenue = metrics.reduce((total, metric) => total + metric.revenue, 0);
  const adSpend = metrics.reduce((total, metric) => total + metric.adSpend, 0);
  const orders = metrics.reduce((total, metric) => total + metric.orders, 0);
  const units = metrics.reduce((total, metric) => total + metric.units, 0);
  const impressions = metrics.reduce((total, metric) => total + metric.impressions, 0);
  const clicks = metrics.reduce((total, metric) => total + metric.clicks, 0);
  const profit = metrics.reduce((total, metric) => total + metric.profit, 0);

  const acos = safeDivide(adSpend, revenue);
  const tacos = safeDivide(adSpend, revenue); // TACoS = Total Ad Spend / Total Brand Revenue
  const roas = safeDivide(revenue, adSpend);
  const ctr = safeDivide(clicks, impressions);
  const conversionRate = safeDivide(orders, clicks);
  const cpc = safeDivide(adSpend, clicks);

  // Business Intelligence: Contribution Profit & Economics
  const contributionEconomics = calculateContributionEconomics({
    revenue,
    adSpend,
    unitsSold: units || orders,
    unitCost: 450, // Average weighted COGS
    unitPrice: 1200,
  });

  // ---------------------------------------------
  // AI RECOMMENDATIONS
  // ---------------------------------------------
  const pendingRecommendations = await prisma.recommendation.count({
    where: {
      amazonAccountId: account.id,
      status: "PENDING",
    },
  });

  const executedRecommendations = await prisma.recommendation.count({
    where: {
      amazonAccountId: account.id,
      status: "EXECUTED",
    },
  });

  // ---------------------------------------------
  // PRODUCTS & INVENTORY INTELLIGENCE
  // ---------------------------------------------
  const productsRaw = await prisma.product.findMany({
    where: {
      amazonAccountId: account.id,
    },
    select: {
      id: true,
      asin: true,
      sku: true,
      title: true,
      category: true,
      price: true,
      costPerUnit: true,
      inventory: true,
      inboundInventory: true,
      targetAcos: true,
      listingScore: true,
    },
    orderBy: {
      listingScore: "asc",
    },
  });

  const products = productsRaw.map((p) => {
    const invEval = evaluateInventoryPpc({
      inventory: p.inventory,
      inboundInventory: p.inboundInventory,
      unitsSold7d: Math.max(1, Math.round(p.inventory * 0.1)),
    });
    return {
      ...p,
      daysOfCover: invEval.daysOfCover,
      inventoryHealth: invEval.inventoryHealth,
      allowAggressiveScaling: invEval.allowAggressiveScaling,
    };
  });

  // ---------------------------------------------
  // CAMPAIGNS
  // ---------------------------------------------
  const campaigns = await prisma.campaign.findMany({
    where: {
      amazonAccountId: account.id,
    },
    select: {
      id: true,
      name: true,
      campaignType: true,
      targetingType: true,
      status: true,
      dailyBudget: true,
      currentSpend: true,
      sales: true,
      orders: true,
      impressions: true,
      clicks: true,
      ctr: true,
      cpc: true,
      acos: true,
      roas: true,
    },
    orderBy: {
      acos: "asc",
    },
  });

  // ---------------------------------------------
  // SEARCH TERM INTELLIGENCE
  // ---------------------------------------------
  const winningSearchTerms = await prisma.searchTerm.count({
    where: {
      campaign: {
        amazonAccountId: account.id,
      },
      classification: "WINNER",
    },
  });

  const wasteSearchTerms = await prisma.searchTerm.count({
    where: {
      campaign: {
        amazonAccountId: account.id,
      },
      classification: "WASTE",
    },
  });

  const neutralSearchTerms = await prisma.searchTerm.count({
    where: {
      campaign: {
        amazonAccountId: account.id,
      },
      classification: "NEUTRAL",
    },
  });

  // ---------------------------------------------
  // DAILY CHART DATA
  // ---------------------------------------------
  const dailyMetrics = metrics.map((metric) => ({
    date: metric.date.toISOString().slice(0, 10),
    revenue: Number(metric.revenue.toFixed(2)),
    adSpend: Number(metric.adSpend.toFixed(2)),
    orders: metric.orders,
    impressions: metric.impressions,
    clicks: metric.clicks,
    acos: Number(metric.acos.toFixed(4)),
    roas: Number(metric.roas.toFixed(2)),
    profit: Number(metric.profit.toFixed(2)),
  }));

  // ---------------------------------------------
  // RETURN DASHBOARD DATA
  // ---------------------------------------------
  return {
    account: {
      id: account.id,
      organizationId: account.organizationId,
      organizationName: account.organization.name,
      sellerName: account.sellerName,
      marketplace: account.marketplace,
      status: account.status,
      automationLevel: account.automationLevel,
      automationPaused: account.automationPaused,
      isLiveAccount: account.isLiveAccount,
      mode: account.isLiveAccount ? "REAL" : "DEMO",
      lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
      syncStatus: account.syncStatus,
    },

    availableAccounts,

    kpis: {
      revenue: Number(revenue.toFixed(2)),
      adSpend: Number(adSpend.toFixed(2)),
      acos: Number(acos.toFixed(4)),
      tacos: Number(tacos.toFixed(4)),
      roas: Number(roas.toFixed(2)),
      orders,
      impressions,
      clicks,
      ctr: Number(ctr.toFixed(4)),
      conversionRate: Number(conversionRate.toFixed(4)),
      cpc: Number(cpc.toFixed(2)),
      profit: Number(profit.toFixed(2)),
      contributionProfit: contributionEconomics.contributionProfit,
      contributionMarginPercent: contributionEconomics.contributionMarginPercent,
      breakEvenAcos: contributionEconomics.breakEvenAcos,
    },

    recommendations: {
      pending: pendingRecommendations,
      executed: executedRecommendations,
    },

    searchTerms: {
      winners: winningSearchTerms,
      waste: wasteSearchTerms,
      neutral: neutralSearchTerms,
    },

    products,
    campaigns,
    dailyMetrics,
  };
}