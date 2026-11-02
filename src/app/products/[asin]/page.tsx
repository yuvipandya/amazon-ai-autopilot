import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Package,
  Search,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import SearchTermAnalyzer from "./SearchTermAnalyzer";

function currency(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function compactCurrency(value: number) {
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(1)}Cr`;
  }

  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(1)}L`;
  }

  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(1)}K`;
  }

  return currency(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function number(value: number) {
  return Math.round(value).toLocaleString("en-IN");
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ asin: string }>;
}) {
  const { asin } = await params;

  const product = await prisma.product.findUnique({
    where: {
      asin,
    },
    include: {
      campaigns: {
        orderBy: {
          createdAt: "asc",
        },
        include: {
          keywords: true,
          searchTerms: true,
        },
      },
      metrics: {
        orderBy: {
          date: "desc",
        },
        take: 14,
      },
    },
  });

  if (!product) {
    return (
      <main className="product-detail-page">
        <div className="product-not-found">
          <Package size={28} />
          <h1>Product not found</h1>
          <p>No product exists for ASIN {asin}.</p>
          <Link href="/products">Back to products</Link>
        </div>
      </main>
    );
  }

  const revenue = product.metrics.reduce(
    (sum, metric) => sum + metric.revenue,
    0,
  );

  const adSpend = product.metrics.reduce(
    (sum, metric) => sum + metric.adSpend,
    0,
  );

  const orders = product.metrics.reduce(
    (sum, metric) => sum + metric.orders,
    0,
  );

  const units = product.metrics.reduce(
    (sum, metric) => sum + metric.units,
    0,
  );

  const profit = product.metrics.reduce(
    (sum, metric) => sum + metric.profit,
    0,
  );

  const impressions = product.metrics.reduce(
    (sum, metric) => sum + metric.impressions,
    0,
  );

  const clicks = product.metrics.reduce(
    (sum, metric) => sum + metric.clicks,
    0,
  );

  const acos = revenue > 0 ? adSpend / revenue : 0;
  const roas = adSpend > 0 ? revenue / adSpend : 0;
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const conversion = clicks > 0 ? orders / clicks : 0;

  const campaigns = product.campaigns;

  const keywords = campaigns.flatMap((campaign) => campaign.keywords);
  const searchTerms = campaigns.flatMap((campaign) => campaign.searchTerms);

  const winners = searchTerms.filter(
    (term) => term.classification === "WINNER",
  );

  const waste = searchTerms.filter(
    (term) => term.classification === "WASTE",
  );

  const activeCampaigns = campaigns.filter(
    (campaign) => campaign.status === "ENABLED",
  );

  const topKeywords = [...keywords]
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 5);

  const recentMetrics = [...product.metrics].reverse();

  return (
    <main className="product-detail-page">
      <div className="product-detail-topbar">
        <Link href="/products" className="product-back-link">
          <ArrowLeft size={14} />
          Back to products
        </Link>

        <span className="product-detail-source">
          <span />
          AMAZON INDIA · DEMO DATA
        </span>
      </div>

      <section className="product-hero">
        <div className="product-hero-left">
          <div className="product-hero-icon">
            <Package size={25} />
          </div>

          <div>
            <div className="product-hero-eyebrow">
              PRODUCT INTELLIGENCE
            </div>

            <h1>{product.title}</h1>

            <div className="product-hero-meta">
              <span>{product.asin}</span>
              <span>·</span>
              <span>{product.sku}</span>
              <span>·</span>
              <span>{product.category}</span>
            </div>
          </div>
        </div>

        <div className="product-hero-actions">
          <div className="product-health-pill">
            <span />
            LISTING HEALTH {product.listingScore}/100
          </div>

          <div className="product-price">
            {currency(product.price)}
          </div>
        </div>
      </section>

      <section className="product-stat-grid">
        <div className="product-stat-card">
          <div className="product-stat-label">
            <CircleDollarSign size={14} />
            Revenue
          </div>
          <strong>{compactCurrency(revenue)}</strong>
          <small>14 day tracked sales</small>
        </div>

        <div className="product-stat-card">
          <div className="product-stat-label">
            <BarChart3 size={14} />
            Ad Spend
          </div>
          <strong>{compactCurrency(adSpend)}</strong>
          <small>Advertising investment</small>
        </div>

        <div className="product-stat-card">
          <div className="product-stat-label">
            <Target size={14} />
            ACoS
          </div>
          <strong className={acos <= product.targetAcos ? "metric-good" : "metric-warning"}>
            {percent(acos)}
          </strong>
          <small>Target {percent(product.targetAcos)}</small>
        </div>

        <div className="product-stat-card">
          <div className="product-stat-label">
            <TrendingUp size={14} />
            ROAS
          </div>
          <strong>{roas.toFixed(2)}x</strong>
          <small>Revenue / ad spend</small>
        </div>

        <div className="product-stat-card">
          <div className="product-stat-label">
            <ShoppingCart size={14} />
            Orders
          </div>
          <strong>{number(orders)}</strong>
          <small>{number(units)} units sold</small>
        </div>

        <div className="product-stat-card">
          <div className="product-stat-label">
            <Boxes size={14} />
            Inventory
          </div>
          <strong>{number(product.inventory)}</strong>
          <small>Units currently available</small>
        </div>
      </section>

      <div className="product-detail-grid">
        <section className="product-panel product-performance-panel">
          <div className="product-panel-header">
            <div>
              <div className="product-panel-title">
                <TrendingUp size={15} />
                Performance overview
              </div>
              <p>14-day product performance signals.</p>
            </div>

            <span className="product-window">14 DAYS</span>
          </div>

          <div className="product-mini-stats">
            <div>
              <span>Profit</span>
              <strong>{compactCurrency(profit)}</strong>
            </div>

            <div>
              <span>CTR</span>
              <strong>{percent(ctr)}</strong>
            </div>

            <div>
              <span>Conversion</span>
              <strong>{percent(conversion)}</strong>
            </div>

            <div>
              <span>Impressions</span>
              <strong>{number(impressions)}</strong>
            </div>

            <div>
              <span>Clicks</span>
              <strong>{number(clicks)}</strong>
            </div>

            <div>
              <span>Cost / Unit</span>
              <strong>{currency(product.costPerUnit)}</strong>
            </div>
          </div>

          <div className="product-metric-bars">
            {recentMetrics.slice(-7).map((metric) => {
              const maxRevenue = Math.max(
                ...recentMetrics.map((item) => item.revenue),
                1,
              );

              const width = Math.max(
                8,
                (metric.revenue / maxRevenue) * 100,
              );

              return (
                <div className="product-bar-row" key={metric.id}>
                  <span>
                    {new Date(metric.date).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>

                  <div className="product-bar-track">
                    <div
                      className="product-bar-fill"
                      style={{ width: `${width}%` }}
                    />
                  </div>

                  <strong>{compactCurrency(metric.revenue)}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="product-panel product-health-panel">
          <div className="product-panel-header">
            <div>
              <div className="product-panel-title">
                <Sparkles size={15} />
                AI product health
              </div>
              <p>Signals Autopilot is monitoring.</p>
            </div>
          </div>

          <div className="health-score">
            <div className="health-score-ring">
              <strong>{product.listingScore}</strong>
              <span>/100</span>
            </div>

            <div>
              <strong>Listing health</strong>
              <p>
                Product content and advertising signals are being evaluated.
              </p>
            </div>
          </div>

          <div className="health-check-list">
            <div>
              <CheckCircle2 size={15} />
              <span>Advertising efficiency</span>
              <strong>{percent(acos)}</strong>
            </div>

            <div>
              <CheckCircle2 size={15} />
              <span>Inventory available</span>
              <strong>{number(product.inventory)}</strong>
            </div>

            <div>
              {waste.length > 0 ? (
                <TriangleAlert size={15} />
              ) : (
                <CheckCircle2 size={15} />
              )}

              <span>Waste search terms</span>
              <strong>{waste.length}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="product-detail-grid">
        <section className="product-panel">
          <div className="product-panel-header">
            <div>
              <div className="product-panel-title">
                <BarChart3 size={15} />
                Campaign performance
              </div>
              <p>{campaigns.length} campaigns connected to this product.</p>
            </div>
          </div>

          <div className="product-campaign-list">
            {campaigns.map((campaign) => (
              <div className="product-campaign-row" key={campaign.id}>
                <div>
                  <strong>{campaign.name}</strong>
                  <span>
                    {campaign.campaignType} · {campaign.targetingType}
                  </span>
                </div>

                <div>
                  <small>Spend</small>
                  <strong>{compactCurrency(campaign.currentSpend)}</strong>
                </div>

                <div>
                  <small>Sales</small>
                  <strong>{compactCurrency(campaign.sales)}</strong>
                </div>

                <div>
                  <small>ACoS</small>
                  <strong
                    className={
                      campaign.acos <= product.targetAcos
                        ? "metric-good"
                        : "metric-warning"
                    }
                  >
                    {percent(campaign.acos)}
                  </strong>
                </div>

                <div>
                  <small>ROAS</small>
                  <strong>{campaign.roas.toFixed(2)}x</strong>
                </div>

                <div className="campaign-status">
                  <span />
                  {campaign.status}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="product-panel">
          <div className="product-panel-header">
            <div>
              <div className="product-panel-title">
                <Target size={15} />
                Advertising summary
              </div>
              <p>Current campaign portfolio health.</p>
            </div>
          </div>

          <div className="advertising-summary">
            <div>
              <span>Active campaigns</span>
              <strong>{activeCampaigns.length}</strong>
            </div>

            <div>
              <span>Keywords</span>
              <strong>{keywords.length}</strong>
            </div>

            <div>
              <span>Search terms</span>
              <strong>{searchTerms.length}</strong>
            </div>

            <div>
              <span>Winner signals</span>
              <strong className="metric-good">{winners.length}</strong>
            </div>

            <div>
              <span>Waste signals</span>
              <strong className="metric-warning">{waste.length}</strong>
            </div>
          </div>

          <div className="advertising-message">
            <Zap size={15} />
            <span>
              Autopilot has enough performance data to generate optimization
              recommendations for this product.
            </span>
          </div>
        </section>
      </div>

      <section className="product-panel">
        <div className="product-panel-header">
          <div>
            <div className="product-panel-title">
              <Search size={15} />
              Keyword intelligence
            </div>
            <p>
              Highest-impact keywords currently driving this product.
            </p>
          </div>

          <span className="product-window">
            {keywords.length} KEYWORDS
          </span>
        </div>

        <div className="keyword-table">
          <div className="keyword-head">
            <span>KEYWORD</span>
            <span>MATCH</span>
            <span>BID</span>
            <span>ORDERS</span>
            <span>SPEND</span>
            <span>SALES</span>
            <span>ACOS</span>
          </div>

          {topKeywords.map((keyword) => (
            <div className="keyword-row" key={keyword.id}>
              <div>
                <strong>{keyword.value}</strong>
                <small>{keyword.status}</small>
              </div>

              <span>{keyword.matchType}</span>

              <strong>{currency(keyword.bid)}</strong>

              <strong>{keyword.orders}</strong>

              <span>{compactCurrency(keyword.spend)}</span>

              <span>{compactCurrency(keyword.sales)}</span>

              <strong
                className={
                  keyword.acos <= product.targetAcos
                    ? "metric-good"
                    : "metric-warning"
                }
              >
                {percent(keyword.acos)}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section className="product-panel product-search-panel">
	<SearchTermAnalyzer productId={product.id} />
        <div className="product-panel-header">
          <div>
            <div className="product-panel-title">
              <Eye size={15} />
              Search-term intelligence
            </div>
            <p>
              Autopilot classification of actual customer search behavior.
            </p>
          </div>
        </div>

        <div className="search-signal-grid">
          <div className="search-signal winner">
            <div>
              <TrendingUp size={17} />
              <strong>Winning terms</strong>
            </div>

            <span>{winners.length}</span>

            <small>Potential keyword expansion</small>
          </div>

          <div className="search-signal waste">
            <div>
              <TriangleAlert size={17} />
              <strong>Waste signals</strong>
            </div>

            <span>{waste.length}</span>

            <small>Potential negative keywords</small>
          </div>

          <div className="search-signal neutral">
            <div>
              <Search size={17} />
              <strong>Other signals</strong>
            </div>

            <span>
              {Math.max(searchTerms.length - winners.length - waste.length, 0)}
            </span>

            <small>Continue collecting data</small>
          </div>
        </div>

        <div className="search-term-list">
          {searchTerms.slice(0, 8).map((term) => (
            <div className="search-term-row" key={term.id}>
              <div className="search-term-name">
                <Search size={13} />
                <strong>{term.value}</strong>
              </div>

              <span
                className={`search-classification ${term.classification.toLowerCase()}`}
              >
                {term.classification}
              </span>

              <span>{term.clicks} clicks</span>

              <span>{term.orders} orders</span>

              <span>{compactCurrency(term.spend)}</span>

              <strong>{percent(term.acos)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="product-ai-opportunity">
        <div className="product-ai-opportunity-icon">
          <Sparkles size={20} />
        </div>

        <div>
          <div className="product-ai-opportunity-title">
            AI opportunity center
          </div>

          <p>
            Autopilot has identified {winners.length} winning search-term
            signals and {waste.length} potential waste signals for this
            product. Review recommendations before execution.
          </p>
        </div>

        <Link href="/ai-changes">
          Review AI changes
          <ArrowUpRight size={14} />
        </Link>
      </section>
    </main>
  );
}