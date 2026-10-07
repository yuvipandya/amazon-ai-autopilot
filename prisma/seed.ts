import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log("Starting Amazon AI Autopilot demo seed...");

  const existingAccounts = await prisma.amazonAccount.count();

  if (existingAccounts > 0 && process.env.FORCE_SEED !== "true") {
    console.log("Seed skipped: demo data already present.");
    return;
  }

  await prisma.auditLog.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.performanceMetric.deleteMany();
  await prisma.searchTerm.deleteMany();
  await prisma.keyword.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.product.deleteMany();
  await prisma.amazonAccount.deleteMany();
  await prisma.organization.deleteMany();

  const organization = await prisma.organization.create({
    data: {
      name: "Demo Commerce Pvt Ltd",
      strategyMode: "BALANCED",
    },
  });

  const account = await prisma.amazonAccount.create({
    data: {
      organizationId: organization.id,
      sellerName: "Demo Commerce India",
      marketplace: "IN",
      sellerId: "DEMO-IN-001",
      status: "ACTIVE",
      automationLevel: 2,
    },
  });

  const jewelry = await prisma.product.create({
    data: {
      amazonAccountId: account.id,
      asin: "B0DEMO001",
      sku: "JEWEL-001",
      title: "Kundan Bridal Choker Necklace Set",
      category: "Jewellery",
      price: 1499,
      costPerUnit: 520,
      inventory: 84,
      targetAcos: 0.22,
      listingScore: 91,
    },
  });

  const bedsheet = await prisma.product.create({
    data: {
      amazonAccountId: account.id,
      asin: "B0DEMO002",
      sku: "HOME-002",
      title: "Premium Cotton Bedsheet King Size",
      category: "Home & Kitchen",
      price: 1299,
      costPerUnit: 430,
      inventory: 142,
      targetAcos: 0.25,
      listingScore: 84,
    },
  });

  const bands = await prisma.product.create({
    data: {
      amazonAccountId: account.id,
      asin: "B0DEMO003",
      sku: "FIT-003",
      title: "Adjustable Resistance Bands Workout Set",
      category: "Sports & Fitness",
      price: 899,
      costPerUnit: 280,
      inventory: 67,
      targetAcos: 0.20,
      listingScore: 76,
    },
  });

  const jewelryAuto = await prisma.campaign.create({
    data: {
      amazonAccountId: account.id,
      productId: jewelry.id,
      name: "Kundan Choker - Auto",
      campaignType: "SPONSORED_PRODUCTS",
      targetingType: "AUTO",
      dailyBudget: 500,
      currentSpend: 7340,
      sales: 38200,
      orders: 31,
      impressions: 182400,
      clicks: 2140,
      ctr: 0.0117,
      cpc: 3.43,
      acos: 0.1921,
      roas: 5.2,
    },
  });

  const jewelryExact = await prisma.campaign.create({
    data: {
      amazonAccountId: account.id,
      productId: jewelry.id,
      name: "Kundan Choker - Exact",
      campaignType: "SPONSORED_PRODUCTS",
      targetingType: "MANUAL",
      dailyBudget: 700,
      currentSpend: 11800,
      sales: 52000,
      orders: 43,
      impressions: 201000,
      clicks: 2890,
      ctr: 0.0144,
      cpc: 4.08,
      acos: 0.2269,
      roas: 4.41,
    },
  });

  const bedsheetBroad = await prisma.campaign.create({
    data: {
      amazonAccountId: account.id,
      productId: bedsheet.id,
      name: "Bedsheet - Broad",
      campaignType: "SPONSORED_PRODUCTS",
      targetingType: "BROAD",
      dailyBudget: 450,
      currentSpend: 9200,
      sales: 28400,
      orders: 22,
      impressions: 164000,
      clicks: 2450,
      ctr: 0.0149,
      cpc: 3.76,
      acos: 0.3239,
      roas: 3.09,
    },
  });

  const bandsExact = await prisma.campaign.create({
    data: {
      amazonAccountId: account.id,
      productId: bands.id,
      name: "Resistance Bands - Exact",
      campaignType: "SPONSORED_PRODUCTS",
      targetingType: "MANUAL",
      dailyBudget: 300,
      currentSpend: 4100,
      sales: 24100,
      orders: 29,
      impressions: 118000,
      clicks: 1640,
      ctr: 0.0139,
      cpc: 2.5,
      acos: 0.1701,
      roas: 5.88,
    },
  });

  const bridalKeyword = await prisma.keyword.create({
    data: {
      campaignId: jewelryExact.id,
      value: "kundan bridal necklace",
      matchType: "EXACT",
      bid: 12,
      impressions: 34200,
      clicks: 480,
      orders: 10,
      spend: 5760,
      sales: 17400,
      acos: 0.331,
    },
  });

  await prisma.keyword.create({
    data: {
      campaignId: jewelryExact.id,
      value: "bridal choker set",
      matchType: "EXACT",
      bid: 14,
      impressions: 29400,
      clicks: 390,
      orders: 12,
      spend: 5460,
      sales: 19800,
      acos: 0.276,
    },
  });

  await prisma.keyword.create({
    data: {
      campaignId: jewelryAuto.id,
      value: "kundan necklace",
      matchType: "PHRASE",
      bid: 10,
      impressions: 18700,
      clicks: 320,
      orders: 7,
      spend: 3200,
      sales: 9800,
      acos: 0.326,
    },
  });

  const winnerTerm = await prisma.searchTerm.create({
    data: {
      campaignId: jewelryAuto.id,
      value: "kundan bridal choker necklace",
      classification: "WINNER",
      impressions: 15400,
      clicks: 188,
      orders: 8,
      spend: 820,
      sales: 11600,
      acos: 0.071,
    },
  });

  const wasteSearchTerm = await prisma.searchTerm.create({
    data: {
      campaignId: jewelryAuto.id,
      value: "cheap plastic jewellery",
      classification: "WASTE",
      impressions: 8400,
      clicks: 22,
      orders: 0,
      spend: 340,
      sales: 0,
      acos: 0,
    },
  });

  await prisma.searchTerm.create({
    data: {
      campaignId: jewelryAuto.id,
      value: "bridal jewellery set",
      classification: "WINNER",
      impressions: 12900,
      clicks: 140,
      orders: 6,
      spend: 690,
      sales: 7800,
      acos: 0.088,
    },
  });

  await prisma.searchTerm.create({
    data: {
      campaignId: jewelryAuto.id,
      value: "gold necklace women",
      classification: "NEUTRAL",
      impressions: 7200,
      clicks: 61,
      orders: 1,
      spend: 220,
      sales: 1499,
      acos: 0.147,
    },
  });

  await prisma.searchTerm.create({
    data: {
      campaignId: bedsheetBroad.id,
      value: "king size cotton bedsheet",
      classification: "WINNER",
      impressions: 15200,
      clicks: 210,
      orders: 7,
      spend: 780,
      sales: 9093,
      acos: 0.086,
    },
  });

  await prisma.searchTerm.create({
    data: {
      campaignId: bedsheetBroad.id,
      value: "cheap bedsheet",
      classification: "WASTE",
      impressions: 9100,
      clicks: 31,
      orders: 0,
      spend: 390,
      sales: 0,
      acos: 0,
    },
  });

  await prisma.searchTerm.create({
    data: {
      campaignId: bandsExact.id,
      value: "resistance band workout",
      classification: "WINNER",
      impressions: 18400,
      clicks: 240,
      orders: 11,
      spend: 560,
      sales: 9890,
      acos: 0.057,
    },
  });

  for (let i = 13; i >= 0; i--) {
    const date = new Date();

    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);

    const jewelryRevenue = 7000 + Math.random() * 1800;
    const jewelrySpend = 1200 + Math.random() * 300;

    const bedsheetRevenue = 4300 + Math.random() * 1400;
    const bedsheetSpend = 1200 + Math.random() * 350;

    const bandsRevenue = 5000 + Math.random() * 1500;
    const bandsSpend = 700 + Math.random() * 180;

    await prisma.performanceMetric.createMany({
      data: [
        {
          productId: jewelry.id,
          date,
          revenue: jewelryRevenue,
          adSpend: jewelrySpend,
          orders: 5 + Math.floor(Math.random() * 4),
          units: 5 + Math.floor(Math.random() * 4),
          impressions: 12000 + Math.floor(Math.random() * 5000),
          clicks: 140 + Math.floor(Math.random() * 70),
          conversion: 0.04 + Math.random() * 0.025,
          ctr: 0.01 + Math.random() * 0.005,
          cpc: 3 + Math.random(),
          acos: jewelrySpend / jewelryRevenue,
          roas: jewelryRevenue / jewelrySpend,
          profit: jewelryRevenue * 0.30 - jewelrySpend,
        },
        {
          productId: bedsheet.id,
          date,
          revenue: bedsheetRevenue,
          adSpend: bedsheetSpend,
          orders: 3 + Math.floor(Math.random() * 3),
          units: 3 + Math.floor(Math.random() * 3),
          impressions: 10000 + Math.floor(Math.random() * 4500),
          clicks: 120 + Math.floor(Math.random() * 60),
          conversion: 0.025 + Math.random() * 0.02,
          ctr: 0.01 + Math.random() * 0.006,
          cpc: 3 + Math.random(),
          acos: bedsheetSpend / bedsheetRevenue,
          roas: bedsheetRevenue / bedsheetSpend,
          profit: bedsheetRevenue * 0.28 - bedsheetSpend,
        },
        {
          productId: bands.id,
          date,
          revenue: bandsRevenue,
          adSpend: bandsSpend,
          orders: 5 + Math.floor(Math.random() * 4),
          units: 5 + Math.floor(Math.random() * 4),
          impressions: 11000 + Math.floor(Math.random() * 4000),
          clicks: 150 + Math.floor(Math.random() * 60),
          conversion: 0.04 + Math.random() * 0.02,
          ctr: 0.012 + Math.random() * 0.005,
          cpc: 2 + Math.random(),
          acos: bandsSpend / bandsRevenue,
          roas: bandsRevenue / bandsSpend,
          profit: bandsRevenue * 0.32 - bandsSpend,
        },
      ],
    });
  }

  const bidRecommendation = await prisma.recommendation.create({
    data: {
      amazonAccountId: account.id,
      productId: jewelry.id,
      campaignId: jewelryExact.id,
      keywordId: bridalKeyword.id,

      actionType: "INCREASE_BID",

      title: "Increase bid on 'kundan bridal necklace'",

      description:
        "This keyword has meaningful traffic and sales history. A bounded bid increase could capture additional impressions.",

      reason:
        "The keyword generated 10 orders from 480 clicks. The proposed increase is 10%, which stays below the 15% per-cycle safety limit.",

      currentValue: 12,
      recommendedValue: 13.2,
      changePercent: 10,

      expectedImpact:
        "Potentially increase qualified traffic while keeping the bid adjustment within safety bounds.",

      confidence: 0.87,
      risk: "LOW",

      status: "PENDING",
      approvalStatus: "PENDING",

      dataWindow: "last_14_days",
      requiresApproval: true,
    },
  });

  await prisma.recommendation.create({
    data: {
      amazonAccountId: account.id,
      productId: jewelry.id,
      campaignId: jewelryAuto.id,
      searchTermId: winnerTerm.id,

      actionType: "HARVEST_KEYWORD",

      title: "Harvest high-performing search term",

      description:
        "A converting search term has sufficient evidence to be promoted into a controlled exact-match keyword.",

      reason:
        "The search term generated 8 orders from 188 clicks with low ACoS.",

      confidence: 0.92,
      risk: "LOW",

      status: "PENDING",
      approvalStatus: "PENDING",

      dataWindow: "last_14_days",
      requiresApproval: true,
    },
  });

  await prisma.recommendation.create({
    data: {
      amazonAccountId: account.id,
      productId: jewelry.id,
      campaignId: jewelryAuto.id,
      searchTermId: wasteSearchTerm.id,
      actionType: "ADD_NEGATIVE_KEYWORD",

      title: "Block wasted search term",

      description:
        "A search term has consumed advertising spend without generating an order.",

      reason:
        "The term received 22 clicks and spent ₹340 with zero orders.",

      currentValue: 340,
      recommendedValue: 0,
      changePercent: -100,

      expectedImpact:
        "Reduce future wasted advertising spend.",

      confidence: 0.94,
      risk: "LOW",

      status: "PENDING",
      approvalStatus: "PENDING",

      dataWindow: "last_14_days",
      requiresApproval: true,
    },
  });

  await prisma.recommendation.create({
    data: {
      amazonAccountId: account.id,
      productId: bedsheet.id,
      campaignId: bedsheetBroad.id,

      actionType: "INCREASE_BUDGET",

      title: "Increase campaign budget",

      description:
        "The campaign has meaningful sales volume but may require additional daily budget during profitable traffic windows.",

      reason:
        "The proposed increase remains bounded and requires approval because budget changes have a larger financial impact.",

      currentValue: 450,
      recommendedValue: 520,
      changePercent: 15.56,

      expectedImpact:
        "Provide additional budget headroom for profitable traffic.",

      confidence: 0.81,
      risk: "MEDIUM",

      status: "PENDING",
      approvalStatus: "PENDING",

      dataWindow: "last_14_days",
      requiresApproval: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      amazonAccountId: account.id,
      recommendationId: bidRecommendation.id,

      entityType: "keyword",
      entityId: bridalKeyword.id,

      action: "RECOMMENDATION_CREATED",

      previousValue: "12",
      newValue: "13.2",

      reason:
        "Bounded bid optimization recommendation generated from demo performance data.",

      aiModel: "demo-rule-engine",
      promptVersion: "v1",
      strategyVersion: "balanced-v1",

      confidence: 0.87,

      approvalStatus: "PENDING",

      executionResult:
        "Recommendation created. No Amazon API call was made.",
    },
  });

  console.log("");
  console.log("==========================================");
  console.log("✅ AMAZON AI AUTOPILOT DEMO DATA CREATED");
  console.log("==========================================");
  console.log(`Organization: ${organization.name}`);
  console.log(`Amazon account: ${account.sellerName}`);
  console.log("Products: 3");
  console.log("Campaigns: 4");
  console.log("Keywords: 3");
  console.log("Search terms: 7");
  console.log("Performance days: 14");
  console.log("Recommendations: 4");
  console.log("==========================================");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



