export const dynamic = "force-dynamic";

import Link from "next/link";
import { CampaignStatus } from "@/generated/prisma/client";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CircleDollarSign,
  Package,
  ShoppingCart,
  Sparkles,
  Target,
} from "lucide-react";
import { prisma } from "@/lib/prisma";

function formatCurrency(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCompact(value: number) {
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(1)}Cr`;
  }

  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(1)}L`;
  }

  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(1)}K`;
  }

  return formatCurrency(value);
}

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    include: {
      campaigns: true,
      metrics: {
        orderBy: {
          date: "desc",
        },
        take: 14,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const productRows = products.map((product) => {
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

    const acos = revenue > 0 ? adSpend / revenue : 0;

    const conversion =
      product.metrics.reduce((sum, metric) => sum + metric.conversion, 0) /
      Math.max(product.metrics.length, 1);

    const activeCampaigns = product.campaigns.filter(
  (campaign) => campaign.status === CampaignStatus.ENABLED,
).length;

    return {
      ...product,
      revenue,
      adSpend,
      orders,
      units,
      profit,
      acos,
      conversion,
      activeCampaigns,
    };
  });

  const totals = productRows.reduce(
    (acc, product) => {
      acc.revenue += product.revenue;
      acc.adSpend += product.adSpend;
      acc.orders += product.orders;
      acc.profit += product.profit;
      return acc;
    },
    {
      revenue: 0,
      adSpend: 0,
      orders: 0,
      profit: 0,
    },
  );

  const blendedAcos =
    totals.revenue > 0 ? totals.adSpend / totals.revenue : 0;

  return (
    <main className="products-page">
      <div className="products-header">
        <div>
          <div className="products-eyebrow">
            <Package size={14} />
            PRODUCT INTELLIGENCE
          </div>

          <h1>Products</h1>

          <p>
            Monitor product performance, advertising efficiency, listing
            health and AI opportunities across your Amazon catalog.
          </p>
        </div>

        <div className="products-header-badge">
          <span className="products-live-dot" />
          DEMO DATA
        </div>
      </div>

      <section className="products-kpi-grid">
        <div className="products-kpi-card">
          <div className="products-kpi-top">
            <span>14D Revenue</span>
            <div className="products-kpi-icon green">
              <CircleDollarSign size={16} />
            </div>
          </div>

          <strong>{formatCompact(totals.revenue)}</strong>

          <small>Tracked product revenue</small>
        </div>

        <div className="products-kpi-card">
          <div className="products-kpi-top">
            <span>Ad Spend</span>
            <div className="products-kpi-icon blue">
              <BarChart3 size={16} />
            </div>
          </div>

          <strong>{formatCompact(totals.adSpend)}</strong>

          <small>Advertising investment</small>
        </div>

        <div className="products-kpi-card">
          <div className="products-kpi-top">
            <span>Blended ACoS</span>
            <div className="products-kpi-icon purple">
              <Target size={16} />
            </div>
          </div>

          <strong>{formatPercent(blendedAcos)}</strong>

          <small>Across all tracked products</small>
        </div>

        <div className="products-kpi-card">
          <div className="products-kpi-top">
            <span>Orders</span>
            <div className="products-kpi-icon cyan">
              <ShoppingCart size={16} />
            </div>
          </div>

          <strong>{totals.orders}</strong>

          <small>Tracked orders</small>
        </div>

        <div className="products-kpi-card">
          <div className="products-kpi-top">
            <span>Estimated Profit</span>
            <div className="products-kpi-icon orange">
              <CircleDollarSign size={16} />
            </div>
          </div>

          <strong>{formatCompact(totals.profit)}</strong>

          <small>Contribution estimate</small>
        </div>
      </section>

      <section className="products-panel">
        <div className="products-panel-header">
          <div>
            <div className="products-panel-title">
              <Boxes size={16} />
              Product portfolio
            </div>

            <p>
              AI-ready view of your catalog performance and advertising
              efficiency.
            </p>
          </div>

          <span className="products-count">
            {products.length} products
          </span>
        </div>

        <div className="products-table">
          <div className="products-table-head">
            <span>PRODUCT</span>
            <span>REVENUE</span>
            <span>AD SPEND</span>
            <span>ACOS</span>
            <span>ORDERS</span>
            <span>INVENTORY</span>
            <span />
          </div>

          {productRows.map((product) => {
            const acosStatus =
              product.acos <= product.targetAcos
                ? "products-good"
                : product.acos <= product.targetAcos * 1.2
                  ? "products-warning"
                  : "products-danger";

            return (
              <Link
                key={product.id}
                href={`/products/${product.asin}`}
                className="products-table-row"
              >
                <div className="products-product-cell">
                  <div className="products-product-icon">
                    <Package size={17} />
                  </div>

                  <div className="products-product-copy">
                    <strong>{product.title}</strong>

                    <span>
                      {product.asin} · {product.sku}
                    </span>

                    <small>
                      {product.activeCampaigns} active campaign
                      {product.activeCampaigns === 1 ? "" : "s"}
                    </small>
                  </div>
                </div>

                <div className="products-number-cell">
                  <strong>{formatCompact(product.revenue)}</strong>
                  <small>{product.units} units</small>
                </div>

                <div className="products-number-cell">
                  <strong>{formatCompact(product.adSpend)}</strong>
                  <small>14 day spend</small>
                </div>

                <div className="products-acos-cell">
                  <strong className={acosStatus}>
                    {formatPercent(product.acos)}
                  </strong>

                  <small>
                    target {formatPercent(product.targetAcos)}
                  </small>
                </div>

                <div className="products-number-cell">
                  <strong>{product.orders}</strong>
                  <small>{formatPercent(product.conversion)} CVR</small>
                </div>

                <div className="products-inventory-cell">
                  <strong>{product.inventory}</strong>
                  <small>units</small>
                </div>

                <div className="products-row-arrow">
                  <ArrowRight size={16} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="products-ai-banner">
        <div className="products-ai-icon">
          <Sparkles size={18} />
        </div>

        <div>
          <strong>AI product intelligence is active</strong>

          <p>
            Autopilot is evaluating product performance, advertising
            efficiency and search-term signals to identify opportunities.
          </p>
        </div>

        <div className="products-ai-status">
          <span />
          ANALYZING
        </div>
      </section>
    </main>
  );
}
