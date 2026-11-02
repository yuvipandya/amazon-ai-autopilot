"use client";

import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Gauge,
  Home as HomeIcon,
  LineChart,
  Menu,
  Package,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";

type DashboardData = {
  account: {
    id: string;
    sellerName: string;
    marketplace: string;
    status: string;
    automationLevel: number;
    isLiveAccount?: boolean;
    mode?: "REAL" | "DEMO";
  };

  kpis: {
    revenue: number;
    adSpend: number;
    acos: number;
    tacos?: number;
    roas: number;
    orders: number;
    impressions: number;
    clicks: number;
    ctr: number;
    conversionRate: number;
    cpc: number;
    profit: number;
    contributionProfit?: number;
    contributionMarginPercent?: number;
    breakEvenAcos?: number;
  };

  recommendations: {
    pending: number;
    executed: number;
  };

  searchTerms: {
    winners: number;
    waste: number;
    neutral: number;
  };

  products: Array<{
    id: string;
    asin: string;
    sku: string;
    title: string;
    category: string;
    price: number;
    costPerUnit: number;
    inventory: number;
    targetAcos: number;
    listingScore: number;
  }>;

  campaigns: Array<{
    id: string;
    name: string;
    campaignType: string;
    targetingType: string;
    status: string;
    dailyBudget: number;
    currentSpend: number;
    sales: number;
    orders: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    acos: number;
    roas: number;
  }>;

  dailyMetrics: Array<{
    date: string;
    revenue: number;
    adSpend: number;
    orders: number;
    impressions: number;
    clicks: number;
    acos: number;
    roas: number;
    profit: number;
  }>;
};

type Recommendation = {
  id: string;
  actionType: string;
  title: string;
  description: string;
  reason: string;
  currentValue: number | null;
  recommendedValue: number | null;
  changePercent: number | null;
  expectedImpact: string | null;
  confidence: number;
  risk: string;
  status: string;
  approvalStatus: string;
};

const navigation = [
  {
    label: "Overview",
    icon: HomeIcon,
    href: "/",
  },
  {
    label: "AI Changes",
    icon: Sparkles,
    badge: 4,
    href: "/ai-changes",
  },
  {
    label: "Grow Sales",
    icon: TrendingUp,
  },
  {
    label: "Advertising",
    icon: Target,
  },
  {
    label: "Products",
    icon: Package,
    href: "/products",
  },
  {
    label: "Orders",
    icon: ShoppingCart,
  },
  {
    label: "Inventory",
    icon: Boxes,
  },
  {
    label: "Competition",
    icon: Users,
  },
  {
    label: "Account Health",
    icon: ShieldCheck,
  },
];

const secondaryNavigation = [
  {
    label: "Activity",
    icon: Activity,
    href: "/activity",
  },
  {
    label: "Settings",
    icon: Settings,
    href: "/settings",
  },
];

function formatCurrency(value: number) {
  return `\u20B9${Math.round(value).toLocaleString("en-IN")}`;
}

function formatCompactCurrency(value: number) {
  if (value >= 10000000) {
    return `\u20B9${(value / 10000000).toFixed(1)}Cr`;
  }

  if (value >= 100000) {
    return `\u20B9${(value / 100000).toFixed(1)}L`;
  }

  if (value >= 1000) {
    return `\u20B9${(value / 1000).toFixed(1)}K`;
  }

  return `\u20B9${Math.round(value).toLocaleString("en-IN")}`;
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-IN");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMultiplier(value: number) {
  return `${value.toFixed(2)}x`;
}

function formatDate(date: string) {
  const parsed = new Date(date);

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

function riskClass(risk: string) {
  if (risk === "LOW") {
    return "risk-low";
  }

  if (risk === "MEDIUM") {
    return "risk-medium";
  }

  if (risk === "HIGH") {
    return "risk-high";
  }

  return "risk-critical";
}

function actionLabel(actionType: string) {
  switch (actionType) {
    case "INCREASE_BID":
      return "Bid optimization";

    case "DECREASE_BID":
      return "Bid optimization";

    case "INCREASE_BUDGET":
      return "Budget optimization";

    case "DECREASE_BUDGET":
      return "Budget optimization";

    case "HARVEST_KEYWORD":
      return "Keyword opportunity";

    case "ADD_NEGATIVE_KEYWORD":
      return "Waste reduction";

    case "LISTING_CHANGE":
      return "Listing optimization";

    default:
      return "AI recommendation";
  }
}

export default function Home() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [recommendations, setRecommendations] = useState<
    Recommendation[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("Overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [range, setRange] = useState("14D");

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const [dashboardResponse, recommendationsResponse] =
          await Promise.all([
            fetch("/api/dashboard", {
              cache: "no-store",
            }),
            fetch("/api/recommendations", {
              cache: "no-store",
            }),
          ]);

        if (!dashboardResponse.ok) {
          throw new Error("Dashboard API request failed");
        }

        const dashboardJson = await dashboardResponse.json();

        if (!dashboardJson.success) {
          throw new Error(
            dashboardJson.error || "Failed to load dashboard"
          );
        }

        setData(dashboardJson.data);

        if (recommendationsResponse.ok) {
          const recommendationsJson =
            await recommendationsResponse.json();

          if (recommendationsJson.success) {
            setRecommendations(
              recommendationsJson.data.recommendations || []
            );
          }
        }
      } catch (err) {
        console.error(err);

        setError(
          "Could not connect to the Autopilot backend. Make sure the development server and database are running."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const chartData = useMemo(() => {
    if (!data) {
      return [];
    }

    const grouped = new Map<
      string,
      {
        date: string;
        revenue: number;
        adSpend: number;
        profit: number;
      }
    >();

    for (const metric of data.dailyMetrics) {
      const existing = grouped.get(metric.date);

      if (existing) {
        existing.revenue += metric.revenue;
        existing.adSpend += metric.adSpend;
        existing.profit += metric.profit;
      } else {
        grouped.set(metric.date, {
          date: metric.date,
          revenue: metric.revenue,
          adSpend: metric.adSpend,
          profit: metric.profit,
        });
      }
    }

    return Array.from(grouped.values()).map((item) => ({
      ...item,
      revenue: Math.round(item.revenue),
      adSpend: Math.round(item.adSpend),
      profit: Math.round(item.profit),
    }));
  }, [data]);

  const healthScore = useMemo(() => {
    if (!data) {
      return 0;
    }

    const listingScoreAverage =
      data.products.reduce(
        (sum, product) => sum + product.listingScore,
        0
      ) / Math.max(data.products.length, 1);

    const campaignScore =
      data.campaigns.length === 0
        ? 0
        : data.campaigns.reduce((sum, campaign) => {
            const acosScore = Math.max(
              0,
              Math.min(100, 100 - campaign.acos * 180)
            );

            return sum + acosScore;
          }, 0) / data.campaigns.length;

    return Math.round(
      listingScoreAverage * 0.55 + campaignScore * 0.45
    );
  }, [data]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-orb">
          <Bot size={28} />
        </div>

        <div>
          <h2>Starting Autopilot</h2>
          <p>Loading your Amazon intelligence layer...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-icon">
            <AlertTriangle size={28} />
          </div>

          <h1>Autopilot couldn&apos;t load</h1>

          <p>
            {error ||
              "The dashboard returned no data from the backend."}
          </p>

          <button
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            Retry connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mobileMenuOpen && (
        <button
          className="mobile-overlay"
          aria-label="Close menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`sidebar ${
          mobileMenuOpen ? "sidebar-open" : ""
        }`}
      >
        <div className="brand">
          <div className="brand-mark">
            <Bot size={21} />
          </div>

          <div>
            <div className="brand-name">AUTOPILOT</div>
            <div className="brand-subtitle">Amazon Intelligence</div>
          </div>

          <button
            className="mobile-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <div className="account-switcher">
          <div className="account-avatar">
            DC
          </div>

          <div className="account-copy">
            <strong>{data.account.sellerName}</strong>
            <span>Amazon India Ã‚Â· {data.account.marketplace}</span>
          </div>

          <ChevronRight size={16} />
        </div>

        <div className="nav-section-label">WORKSPACE</div>

        <nav className="navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.label;

            return (
              <button
                key={item.label}
                className={`nav-item ${
                  active ? "nav-item-active" : ""
                }`}
                onClick={() => {
                  setActiveSection(item.label);
                  setMobileMenuOpen(false);

                  if (item.href) {
                    window.location.href = item.href;
                  }
                }}
              >
                <Icon size={18} strokeWidth={1.8} />

                <span>{item.label}</span>

                {item.badge ? (
                  <span className="nav-badge">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="nav-section-label nav-section-secondary">
          SYSTEM
        </div>

        <nav className="navigation">
          {secondaryNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className={`nav-item ${
                  activeSection === item.label
                    ? "nav-item-active"
                    : ""
                }`}
                onClick={() => {
                  setActiveSection(item.label);
                  setMobileMenuOpen(false);

                  if (item.href) {
                    window.location.href = item.href;
                  }
                }}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="autopilot-status">
            <div className="status-dot" />

            <div>
              <strong>Autopilot online</strong>
              <span>
                Level {data.account.automationLevel} Ã‚Â· Protected
              </span>
            </div>
          </div>

          <div className="sidebar-version">
            <span>Amazon AI Autopilot</span>
            <span>v0.1 Demo</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>

            <div>
              <div className="breadcrumb">
                Workspace
                <ChevronRight size={13} />
                {activeSection}
              </div>

              <h1>{activeSection}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <div className={`demo-pill ${data.account.isLiveAccount ? "live-connector" : ""}`}>
              <span className="demo-dot" />
              {data.account.isLiveAccount ? "LIVE AMAZON ADS API" : "DEMO MODE (Mock Connector)"}
            </div>

            <button className="icon-button" aria-label="Search">
              <Search size={19} />
            </button>

            <button className="icon-button" aria-label="Notifications">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>

            <div className="user-avatar">YP</div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <Sparkles size={14} />
                AI PERFORMANCE CENTER
              </div>

              <h2>
                Good afternoon.
                <span> Here&apos;s what Autopilot found.</span>
              </h2>

              <p>
                Your store is generating{" "}
                <strong>
                  {formatCompactCurrency(data.kpis.revenue)}
                </strong>{" "}
                in tracked revenue with{" "}
                <strong>
                  {data.recommendations.pending}
                </strong>{" "}
                opportunities waiting for review.
              </p>
            </div>

            <div className="date-control">
              {["7D", "14D", "30D"].map((option) => (
                <button
                  key={option}
                  className={
                    range === option ? "range-active" : ""
                  }
                  onClick={() => setRange(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </section>

          <section className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-header">
                <span>Revenue</span>
                <div className="kpi-icon green">
                  <CircleDollarSign size={17} />
                </div>
              </div>

              <div className="kpi-value">
                {formatCompactCurrency(data.kpis.revenue)}
              </div>

              <div className="kpi-footer">
                <span className="positive">
                  <ArrowUpRight size={14} />
                  12.4%
                </span>
                <span>vs previous period</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span>Ad Spend</span>
                <div className="kpi-icon blue">
                  <BarChart3 size={17} />
                </div>
              </div>

              <div className="kpi-value">
                {formatCompactCurrency(data.kpis.adSpend)}
              </div>

              <div className="kpi-footer">
                <span className="neutral">
                  <Activity size={14} />
                  Live
                </span>
                <span>tracked spend</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span>ACoS</span>
                <div className="kpi-icon purple">
                  <Gauge size={17} />
                </div>
              </div>

              <div className="kpi-value">
                {formatPercent(data.kpis.acos)}
              </div>

              <div className="kpi-footer">
                <span className="positive">
                  <ArrowDownRight size={14} />
                  efficient
                </span>
                <span>blended advertising</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span>TACoS</span>
                <div className="kpi-icon purple">
                  <Target size={17} />
                </div>
              </div>

              <div className="kpi-value">
                {formatPercent(data.kpis.tacos ?? data.kpis.acos)}
              </div>

              <div className="kpi-footer">
                <span className="positive">
                  <ArrowDownRight size={14} />
                  first-class
                </span>
                <span>total ad spend / revenue</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span>ROAS</span>
                <div className="kpi-icon orange">
                  <TrendingUp size={17} />
                </div>
              </div>

              <div className="kpi-value">
                {formatMultiplier(data.kpis.roas)}
              </div>

              <div className="kpi-footer">
                <span className="positive">
                  <ArrowUpRight size={14} />
                  strong
                </span>
                <span>revenue / ad spend</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span>Orders</span>
                <div className="kpi-icon cyan">
                  <ShoppingCart size={17} />
                </div>
              </div>

              <div className="kpi-value">
                {formatNumber(data.kpis.orders)}
              </div>

              <div className="kpi-footer">
                <span className="positive">
                  <ArrowUpRight size={14} />
                  growing
                </span>
                <span>tracked orders</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span>Contribution Profit</span>
                <div className="kpi-icon green">
                  <CircleDollarSign size={17} />
                </div>
              </div>

              <div className="kpi-value">
                {formatCompactCurrency(data.kpis.contributionProfit ?? data.kpis.profit)}
              </div>

              <div className="kpi-footer">
                <span className="positive">
                  <ArrowUpRight size={14} />
                  {data.kpis.contributionMarginPercent ? `${data.kpis.contributionMarginPercent.toFixed(1)}% margin` : "healthy"}
                </span>
                <span>after COGS, fees & ad spend</span>
              </div>
            </div>
          </section>

          <section className="main-grid">
            <div className="panel chart-panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title-row">
                    <h3>Revenue performance</h3>
                    <span className="live-label">
                      <span />
                      LIVE
                    </span>
                  </div>

                  <p>
                    Revenue, advertising spend and contribution
                    trend
                  </p>
                </div>

                <div className="chart-legend">
                  <span>
                    <i className="legend-revenue" />
                    Revenue
                  </span>

                  <span>
                    <i className="legend-spend" />
                    Ad spend
                  </span>
                </div>
              </div>

              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{
                      top: 10,
                      right: 4,
                      left: -18,
                      bottom: 0,
                    }}
                  >
                    <defs>
                      <linearGradient
                        id="revenueGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.26}
                        />
                        <stop
                          offset="100%"
                          stopColor="#8b5cf6"
                          stopOpacity={0}
                        />
                      </linearGradient>

                      <linearGradient
                        id="spendGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#38bdf8"
                          stopOpacity={0.16}
                        />
                        <stop
                          offset="100%"
                          stopColor="#38bdf8"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      stroke="#20232c"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      stroke="#555b6b"
                      tickLine={false}
                      axisLine={false}
                      tick={{
                        fill: "#777d8d",
                        fontSize: 11,
                      }}
                      minTickGap={30}
                    />

                    <YAxis
                      stroke="#555b6b"
                      tickLine={false}
                      axisLine={false}
                      tick={{
                        fill: "#777d8d",
                        fontSize: 11,
                      }}
                      tickFormatter={(value) =>
                        formatCompactCurrency(value)
                      }
                    />

                    <Tooltip
                      contentStyle={{
                        background: "#11131a",
                        border: "1px solid #292d38",
                        borderRadius: "10px",
                        color: "#fff",
                        boxShadow:
                          "0 15px 40px rgba(0,0,0,.4)",
                      }}
                      labelFormatter={(label) =>
                        formatDate(String(label))
                      }
                      formatter={(value, name) => [
                        formatCurrency(Number(value)),
                        name === "revenue"
                          ? "Revenue"
                          : "Ad spend",
                      ]}
                    />

                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      fill="url(#revenueGradient)"
                    />

                    <Area
                      type="monotone"
                      dataKey="adSpend"
                      stroke="#38bdf8"
                      strokeWidth={1.7}
                      fill="url(#spendGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel intelligence-panel">
              <div className="panel-header">
                <div>
                  <h3>AI intelligence</h3>
                  <p>What needs your attention</p>
                </div>

                <div className="ai-status">
                  <Sparkles size={15} />
                </div>
              </div>

              <div className="intelligence-score">
                <div className="score-ring">
                  <div>
                    <strong>{healthScore}</strong>
                    <span>/100</span>
                  </div>
                </div>

                <div>
                  <strong>Store health</strong>
                  <p>
                    Based on listing quality, campaign
                    efficiency and account signals.
                  </p>
                </div>
              </div>

              <div className="signal-list">
                <div className="signal">
                  <div className="signal-icon positive-icon">
                    <TrendingUp size={15} />
                  </div>

                  <div>
                    <strong>
                      {data.searchTerms.winners} winning
                      search terms
                    </strong>
                    <span>
                      Potential keyword expansion
                    </span>
                  </div>

                  <ChevronRight size={15} />
                </div>

                <div className="signal">
                  <div className="signal-icon warning-icon">
                    <AlertTriangle size={15} />
                  </div>

                  <div>
                    <strong>
                      {data.searchTerms.waste} waste signals
                    </strong>
                    <span>Negative keyword candidates</span>
                  </div>

                  <ChevronRight size={15} />
                </div>

                <div className="signal">
                  <div className="signal-icon purple-icon">
                    <Zap size={15} />
                  </div>

                  <div>
                    <strong>
                      {data.recommendations.pending} AI
                      recommendations
                    </strong>
                    <span>Waiting for review</span>
                  </div>

                  <ChevronRight size={15} />
                </div>
              </div>
            </div>
          </section>

          <section className="bottom-grid">
            <div className="panel recommendations-panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title-row">
                    <h3>AI changes requiring attention</h3>
                    <span className="count-badge">
                      {data.recommendations.pending}
                    </span>
                  </div>

                  <p>
                    Recommendations generated from your
                    performance data
                  </p>
                </div>

                <button
                  className="text-button"
                  onClick={() => {
                    setActiveSection("AI Changes");
                    router.push("/ai-changes");
                  }}
                >
                  Review all
                  <ChevronRight size={15} />
                </button>
              </div>

              <div className="recommendation-list">
                {recommendations.length === 0 ? (
                  <div className="empty-state">
                    <Sparkles size={24} />
                    <strong>No recommendations loaded</strong>
                    <span>
                      The AI recommendation engine has not
                      returned any changes yet.
                    </span>
                  </div>
                ) : (
                  recommendations
                    .slice(0, 4)
                    .map((recommendation) => (
                      <div
                        className="recommendation-row"
                        key={recommendation.id}
                      >
                        <div className="recommendation-type">
                          <div
                            className={`recommendation-icon ${
                              recommendation.actionType ===
                              "ADD_NEGATIVE_KEYWORD"
                                ? "red"
                                : recommendation.actionType ===
                                    "INCREASE_BUDGET"
                                  ? "orange"
                                  : "purple"
                            }`}
                          >
                            {recommendation.actionType ===
                            "ADD_NEGATIVE_KEYWORD" ? (
                              <ArrowDownRight size={17} />
                            ) : recommendation.actionType ===
                              "INCREASE_BUDGET" ? (
                              <BarChart3 size={17} />
                            ) : (
                              <Sparkles size={17} />
                            )}
                          </div>

                          <div>
                            <span className="recommendation-category">
                              {actionLabel(
                                recommendation.actionType
                              )}
                            </span>

                            <strong>
                              {recommendation.title}
                            </strong>

                            <span className="recommendation-reason">
                              {recommendation.reason}
                            </span>
                          </div>
                        </div>

                        <div className="recommendation-meta">
                          <div
                            className={`risk-pill ${riskClass(
                              recommendation.risk
                            )}`}
                          >
                            {recommendation.risk}
                          </div>

                          <span className="confidence">
                            {Math.round(
                              recommendation.confidence *
                                100
                            )}
                            % confidence
                          </span>
                        </div>

                        <button
                          className="review-button"
                          onClick={() => {
                            setActiveSection("AI Changes");
                            router.push("/ai-changes");
                          }}
                        >
                          Review
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>

            <div className="panel campaign-panel">
              <div className="panel-header">
                <div>
                  <h3>Campaign health</h3>
                  <p>Current advertising performance</p>
                </div>

                <button className="icon-button small">
                  <BarChart3 size={16} />
                </button>
              </div>

              <div className="campaign-list">
                {data.campaigns.map((campaign) => {
                  const healthy =
                    campaign.acos <= 0.25;

                  return (
                    <div
                      className="campaign-row"
                      key={campaign.id}
                    >
                      <div className="campaign-main">
                        <div
                          className={`campaign-status ${
                            healthy
                              ? "campaign-good"
                              : "campaign-warning"
                          }`}
                        />

                        <div>
                          <strong>{campaign.name}</strong>
                          <span>
                            {campaign.targetingType} Ã‚Â·{" "}
                            {formatNumber(campaign.orders)} orders
                          </span>
                        </div>
                      </div>

                      <div className="campaign-metrics">
                        <strong>
                          {formatPercent(campaign.acos)}
                        </strong>

                        <span>
                          {formatMultiplier(campaign.roas)} ROAS
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="panel products-panel">
            <div className="panel-header">
              <div>
                <div className="panel-title-row">
                  <h3>Product portfolio</h3>
                  <span className="small-muted">
                    {data.products.length} products
                  </span>
                </div>

                <p>
                  Listing quality and inventory signals
                </p>
              </div>

              <button
                className="text-button"
                onClick={() => {
                  setActiveSection("Products");
                  router.push("/products");
                }}
              >
                View products
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="product-table">
              <div className="product-table-header">
                <span>PRODUCT</span>
                <span>PRICE</span>
                <span>INVENTORY</span>
                <span>LISTING SCORE</span>
                <span>TARGET ACoS</span>
              </div>

              {data.products.map((product) => (
                <div
                  className="product-table-row"
                  key={product.id}
                >
                  <div className="product-name">
                    <div className="product-placeholder">
                      <Package size={18} />
                    </div>

                    <div>
                      <strong>{product.title}</strong>
                      <span>
                        {product.asin} Ã‚Â· {product.category}
                      </span>
                    </div>
                  </div>

                  <strong>
                    {formatCurrency(product.price)}
                  </strong>

                  <div className="inventory-cell">
                    <span
                      className={
                        product.inventory < 50
                          ? "inventory-low"
                          : ""
                      }
                    >
                      {formatNumber(product.inventory)}
                    </span>
                    <small>units</small>
                  </div>

                  <div className="score-cell">
                    <div className="score-bar">
                      <span
                        style={{
                          width: `${product.listingScore}%`,
                        }}
                      />
                    </div>

                    <strong>{product.listingScore}</strong>
                  </div>

                  <span className="acos-target">
                    {formatPercent(product.targetAcos)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <footer className="dashboard-footer">
            <div>
              <ShieldCheck size={14} />
              AI decisions are protected by deterministic
              validation and policy controls.
            </div>

            <div>
              <Clock3 size={14} />
              Last synced just now
            </div>

            <div>
              <LineChart size={14} />
              {data.dailyMetrics.length} performance records
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}


