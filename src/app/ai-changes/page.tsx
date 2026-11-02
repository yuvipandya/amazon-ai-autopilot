"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  Clock3,
  Filter,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

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
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: string;
  approvalStatus: string;
  dataWindow: string | null;
  requiresApproval: boolean;

  product?: {
    id: string;
    asin: string;
    title: string;
    price: number;
    targetAcos: number;
    listingScore: number;
  } | null;

  campaign?: {
    id: string;
    name: string;
    targetingType: string;
    dailyBudget: number;
    acos: number;
    roas: number;
  } | null;

  keyword?: {
    id: string;
    value: string;
    matchType: string;
    bid: number;
    clicks: number;
    orders: number;
    spend: number;
    sales: number;
    acos: number;
  } | null;

  searchTerm?: {
    id: string;
    value: string;
    classification: string;
    clicks: number;
    orders: number;
    spend: number;
    sales: number;
    acos: number;
  } | null;
};

type ActionResult = {
  success: boolean;
  stage?: string;
  message?: string;
  validation?: {
    passed: boolean;
    reason: string;
    checks: {
      name: string;
      passed: boolean;
      message: string;
    }[];
  };
  policy?: {
    passed: boolean;
    reason: string;
    requiresApproval: boolean;
  };
  risk?: {
    passed: boolean;
    level: string;
    reason: string;
  };
  permission?: {
    allowed: boolean;
    reason: string;
  };
  execution?: {
    success: boolean;
    action: string;
    entityType: string;
    entityId: string;
    previousValue: number | null;
    newValue: number | null;
    message: string;
  };
};
type RollbackResult = {
  success: boolean;
  action: "ROLLBACK";
  entityType: string;
  entityId: string;
  previousValue: number;
  restoredValue: number;
  message: string;
  };

const actionLabels: Record<string, string> = {
  INCREASE_BID: "Bid Optimization",
  DECREASE_BID: "Bid Optimization",
  INCREASE_BUDGET: "Budget Optimization",
  DECREASE_BUDGET: "Budget Optimization",
  HARVEST_KEYWORD: "Keyword Harvest",
  ADD_NEGATIVE_KEYWORD: "Negative Keyword",
};

function formatAction(action: string) {
  return actionLabels[action] ?? action.replaceAll("_", " ");
}

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "â€”";
  }

  return `â‚¹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "â€”";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function confidencePercent(value: number) {
  return Math.round(value * 100);
}

function getTargetName(recommendation: Recommendation) {
  if (recommendation.keyword) {
    return recommendation.keyword.value;
  }

  if (recommendation.searchTerm) {
    return recommendation.searchTerm.value;
  }

  if (recommendation.campaign) {
    return recommendation.campaign.name;
  }

  if (recommendation.product) {
    return recommendation.product.title;
  }

  return "Amazon account";
}

function RiskBadge({
  risk,
}: {
  risk: Recommendation["risk"];
}) {
  return (
    <span className={`risk-badge risk-${risk.toLowerCase()}`}>
      <span className="risk-dot" />
      {risk}
    </span>
  );
}

function ActionIcon({
  action,
}: {
  action: string;
}) {
  if (
    action === "INCREASE_BID" ||
    action === "INCREASE_BUDGET"
  ) {
    return <ArrowUpRight size={15} />;
  }

  if (
    action === "DECREASE_BID" ||
    action === "DECREASE_BUDGET"
  ) {
    return <ArrowDownRight size={15} />;
  }

  if (action === "HARVEST_KEYWORD") {
    return <Target size={15} />;
  }

  return <ShieldCheck size={15} />;
}

export default function AIChangesPage() {
  const [recommendations, setRecommendations] = useState<
    Recommendation[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState<
    "ALL" | "LOW" | "MEDIUM"
  >("ALL");

  const [selected, setSelected] =
    useState<Recommendation | null>(null);

  const [executing, setExecuting] = useState(false);

  const [actionResult, setActionResult] =
  useState<
    (ActionResult & Partial<RollbackResult>) | null
  >(null);

  const [actionError, setActionError] =
    useState("");

  const loadRecommendations = useCallback(
    async (showRefresh = false) => {
      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const response = await fetch(
          "/api/recommendations",
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load recommendations (${response.status})`
          );
        }

        const json = await response.json();

        setRecommendations(
          json?.data?.recommendations ?? []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load AI changes."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      await Promise.resolve();

      if (!controller.signal.aborted) {
        await loadRecommendations();
      }
    };

    void run();

    return () => {
      controller.abort();
    };
  }, [loadRecommendations]);

  const filteredRecommendations = useMemo(() => {
    if (filter === "ALL") {
      return recommendations;
    }

    return recommendations.filter(
      (recommendation) =>
        recommendation.risk === filter
    );
  }, [recommendations, filter]);

  async function runAction(
  recommendation: Recommendation,
  action:
  | "APPROVE"
  | "REJECT"
  | "EXECUTE"
  | "IGNORE"
  | "LOCK"
  | "ROLLBACK"
  ) {
    try {
      setExecuting(true);
      setActionError("");
      setActionResult(null);

      const response = await fetch(
        `/api/recommendations/${recommendation.id}/action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok || !json.success) {
        setActionResult(json);

        throw new Error(
          json.message ??
            json.error ??
            "Action could not be completed."
        );
      }

      setActionResult(json);

      if (
        action === "APPROVE" ||
        action === "REJECT" ||
        action === "EXECUTE" ||
        action === "IGNORE" ||
        action === "LOCK"
      ) {
        await loadRecommendations(true);
      }
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Action failed."
      );
    } finally {
      setExecuting(false);
    }
  }

  function closeDrawer() {
    if (executing) {
      return;
    }

    setSelected(null);
    setActionResult(null);
    setActionError("");
  }

  const lowCount = recommendations.filter(
    (item) => item.risk === "LOW"
  ).length;

  const mediumCount = recommendations.filter(
    (item) => item.risk === "MEDIUM"
  ).length;

  return (
    <main className="ai-page">
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #080a0f;
          color: #f5f7fb;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        button {
          font: inherit;
        }

        .ai-page {
          min-height: 100vh;
          padding: 34px 38px 60px;
          background:
            radial-gradient(
              circle at 82% 5%,
              rgba(77, 91, 255, 0.08),
              transparent 28%
            ),
            #080a0f;
        }

        .ai-shell {
          max-width: 1440px;
          margin: 0 auto;
        }

        .top-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          margin-bottom: 30px;
        }

        .eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #8d96a8;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          margin-bottom: 9px;
        }

        .eyebrow-icon {
          color: #8b5cf6;
        }

        h1 {
          margin: 0;
          font-size: 34px;
          line-height: 1.1;
          letter-spacing: -0.035em;
        }

        .subtitle {
          color: #8e96a8;
          font-size: 14px;
          margin: 10px 0 0;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .refresh-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid #242936;
          background: #11141b;
          color: #cdd3df;
          cursor: pointer;
          transition: 160ms ease;
        }

        .refresh-button:hover {
          border-color: #3a4152;
          background: #151923;
        }

        .refresh-button:disabled {
          opacity: 0.55;
          cursor: default;
        }

        .summary-grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.6fr)
            repeat(3, minmax(150px, 0.7fr));
          gap: 12px;
          margin-bottom: 26px;
        }

        .summary-card {
          border: 1px solid #1e232e;
          background: linear-gradient(
            145deg,
            #11141b,
            #0d1016
          );
          border-radius: 15px;
          padding: 18px;
        }

        .summary-main {
          background:
            linear-gradient(
              135deg,
              rgba(124, 58, 237, 0.16),
              rgba(17, 20, 27, 0.95)
            );
        }

        .summary-label {
          color: #858ea0;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .summary-number {
          font-size: 29px;
          font-weight: 800;
          margin-top: 7px;
          letter-spacing: -0.04em;
        }

        .summary-sub {
          color: #747d90;
          font-size: 12px;
          margin-top: 4px;
        }

        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 15px;
        }

        .filters {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .filter-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #737c8e;
          font-size: 12px;
          margin-right: 4px;
        }

        .filter-button {
          border: 1px solid #222733;
          background: #0f1218;
          color: #858ea0;
          border-radius: 9px;
          padding: 8px 12px;
          font-size: 12px;
          cursor: pointer;
        }

        .filter-button.active {
          color: #f4f5f8;
          border-color: #454d60;
          background: #1a1f29;
        }

        .result-count {
          color: #697286;
          font-size: 12px;
        }

        .cards {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(360px, 1fr)
          );
          gap: 14px;
        }

        .recommendation-card {
          position: relative;
          overflow: hidden;
          border: 1px solid #202530;
          border-radius: 16px;
          background:
            linear-gradient(
              160deg,
              rgba(20, 24, 33, 0.98),
              rgba(12, 15, 21, 0.98)
            );
          padding: 20px;
          transition:
            transform 160ms ease,
            border-color 160ms ease;
        }

        .recommendation-card:hover {
          transform: translateY(-2px);
          border-color: #343b4b;
        }

        .recommendation-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #7c3aed;
          opacity: 0.9;
        }

        .card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 17px;
        }

        .action-type {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #a99ad7;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .risk-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
        }

        .risk-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .risk-low {
          color: #6ee7b7;
          background: rgba(16, 185, 129, 0.08);
        }

        .risk-medium {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.08);
        }

        .risk-high {
          color: #fb923c;
          background: rgba(249, 115, 22, 0.08);
        }

        .risk-critical {
          color: #f87171;
          background: rgba(239, 68, 68, 0.08);
        }

        .card-title {
          margin: 0;
          font-size: 17px;
          line-height: 1.35;
          letter-spacing: -0.02em;
        }

        .target {
          margin-top: 7px;
          color: #8b94a6;
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .value-box {
          display: flex;
          align-items: center;
          gap: 13px;
          margin: 20px 0;
          padding: 14px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid #1d222d;
        }

        .value-side {
          flex: 1;
        }

        .value-label {
          color: #697286;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .value {
          font-size: 20px;
          font-weight: 800;
          margin-top: 3px;
        }

        .value-arrow {
          color: #626b7d;
        }

        .change {
          color: #6ee7b7;
          font-size: 12px;
          font-weight: 700;
          margin-top: 3px;
        }

        .card-reason {
          color: #a4acba;
          font-size: 13px;
          line-height: 1.55;
          min-height: 42px;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 17px;
        }

        .metric {
          border: 1px solid #1e232e;
          background: #0d1016;
          border-radius: 10px;
          padding: 10px;
        }

        .metric-label {
          color: #697286;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .metric-value {
          color: #e3e7ee;
          font-size: 14px;
          font-weight: 750;
          margin-top: 4px;
        }

        .card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 17px;
          padding-top: 15px;
          border-top: 1px solid #1b2029;
        }

        .confidence {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #818a9d;
          font-size: 11px;
        }

        .confidence strong {
          color: #d9dde6;
        }

        .review-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #40336c;
          background: rgba(124, 58, 237, 0.12);
          color: #c4b5fd;
          padding: 8px 11px;
          border-radius: 9px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .review-button:hover {
          background: rgba(124, 58, 237, 0.2);
        }

        .empty-state,
        .loading-state,
        .error-state {
          border: 1px dashed #252b37;
          border-radius: 16px;
          padding: 65px 20px;
          text-align: center;
          color: #737d90;
          background: rgba(15, 18, 24, 0.65);
        }

        .empty-icon {
          margin: 0 auto 12px;
          color: #6ee7b7;
        }

        .empty-state h2 {
          color: #dfe3ea;
          font-size: 18px;
          margin: 0 0 7px;
        }

        .empty-state p {
          margin: 0;
          font-size: 13px;
        }

        .error-state {
          color: #fca5a5;
        }

        .drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.68);
          backdrop-filter: blur(5px);
          z-index: 100;
        }

        .drawer {
          position: fixed;
          right: 0;
          top: 0;
          bottom: 0;
          width: min(590px, 100vw);
          background: #0d1016;
          border-left: 1px solid #252b36;
          z-index: 101;
          overflow-y: auto;
          box-shadow: -25px 0 70px rgba(0, 0, 0, 0.35);
        }

        .drawer-header {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          padding: 23px;
          background: rgba(13, 16, 22, 0.94);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid #202631;
        }

        .drawer-eyebrow {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #a78bfa;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .drawer-title {
          margin: 7px 0 0;
          font-size: 20px;
          line-height: 1.3;
        }

        .close-button {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 1px solid #262c37;
          border-radius: 9px;
          background: #12151c;
          color: #8992a4;
          cursor: pointer;
          flex: 0 0 auto;
        }

        .drawer-content {
          padding: 22px;
        }

        .drawer-section {
          margin-bottom: 25px;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #e0e4eb;
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 11px;
        }

        .section-title svg {
          color: #8b5cf6;
        }

        .reason-box {
          border: 1px solid #222833;
          border-radius: 12px;
          padding: 14px;
          color: #9da6b6;
          font-size: 13px;
          line-height: 1.6;
          background: #10131a;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .detail-card {
          border: 1px solid #202631;
          border-radius: 11px;
          padding: 12px;
          background: #10131a;
        }

        .detail-card span {
          display: block;
          color: #697286;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .detail-card strong {
          display: block;
          margin-top: 5px;
          color: #e0e4eb;
          font-size: 14px;
        }

        .check-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .check {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 10px;
          border-radius: 9px;
          background: #10131a;
          border: 1px solid #202631;
        }

        .check-icon {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          background: rgba(16, 185, 129, 0.1);
          color: #6ee7b7;
        }

        .check-icon.failed {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
        }

        .check-text strong {
          display: block;
          color: #dce1e9;
          font-size: 11px;
        }

        .check-text span {
          display: block;
          color: #737d90;
          font-size: 11px;
          margin-top: 2px;
          line-height: 1.45;
        }

        .action-result {
          border-radius: 13px;
          padding: 15px;
          border: 1px solid #275b46;
          background: rgba(16, 185, 129, 0.06);
          margin-bottom: 20px;
        }

        .result-heading {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #6ee7b7;
          font-weight: 800;
          font-size: 13px;
        }

        .result-message {
          color: #9ba5b5;
          font-size: 12px;
          line-height: 1.5;
          margin-top: 8px;
        }

        .result-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 12px;
        }

        .result-cell {
          padding: 9px;
          background: rgba(0, 0, 0, 0.16);
          border-radius: 8px;
        }

        .result-cell span {
          display: block;
          color: #687285;
          font-size: 9px;
          text-transform: uppercase;
        }

        .result-cell strong {
          display: block;
          color: #dce2ea;
          font-size: 12px;
          margin-top: 3px;
        }

        .drawer-actions {
          position: sticky;
          bottom: 0;
          display: flex;
          gap: 9px;
          padding-top: 18px;
          padding-bottom: 2px;
          background: linear-gradient(
            transparent,
            #0d1016 18%
          );
        }

        .drawer-action {
          flex: 1;
          border-radius: 10px;
          padding: 11px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 750;
        }

        .execute-button {
          border: 1px solid #6044a5;
          background: #7c3aed;
          color: white;
        }

        .execute-button:hover {
          background: #8b5cf6;
        }

        .secondary-button {
          border: 1px solid #272d38;
          background: #141820;
          color: #9ba4b4;
        }

        .secondary-button:hover {
          background: #1a1f28;
          color: #d6dae2;
        }

        .drawer-action:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .action-error {
          color: #fca5a5;
          background: rgba(239, 68, 68, 0.07);
          border: 1px solid rgba(239, 68, 68, 0.2);
          padding: 11px;
          border-radius: 9px;
          font-size: 11px;
          margin-bottom: 14px;
        }

        @media (max-width: 900px) {
          .summary-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .summary-main {
            grid-column: span 2;
          }

          .top-row {
            flex-direction: column;
          }
        }

        @media (max-width: 620px) {
          .ai-page {
            padding: 22px 14px 40px;
          }

          .summary-grid {
            grid-template-columns: 1fr 1fr;
          }

          .summary-main {
            grid-column: span 2;
          }

          .cards {
            grid-template-columns: 1fr;
          }

          .toolbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .filters {
            flex-wrap: wrap;
          }
        }
      `}</style>

      <div className="ai-shell">
        <div className="top-row">
          <div>
            <div className="eyebrow">
              <Sparkles
                size={14}
                className="eyebrow-icon"
              />
              AI Intelligence Center
            </div>

            <h1>AI Changes</h1>

            <p className="subtitle">
              Review recommendations before they affect
              your Amazon account.
            </p>
          </div>

          <div className="header-actions">
            <button
              className="refresh-button"
              onClick={() => loadRecommendations(true)}
              disabled={refreshing}
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? "spin"
                    : undefined
                }
              />
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>
        </div>

        <div className="summary-grid">
          <div className="summary-card summary-main">
            <div className="summary-label">
              Pending AI changes
            </div>

            <div className="summary-number">
              {recommendations.length}
            </div>

            <div className="summary-sub">
              Recommendations waiting for seller review
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-label">
              Low risk
            </div>

            <div className="summary-number">
              {lowCount}
            </div>

            <div className="summary-sub">
              Controlled actions
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-label">
              Medium risk
            </div>

            <div className="summary-number">
              {mediumCount}
            </div>

            <div className="summary-sub">
              Needs closer review
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-label">
              Automation
            </div>

            <div className="summary-number">
              L2
            </div>

            <div className="summary-sub">
              Seller approval enabled
            </div>
          </div>
        </div>

        <div className="toolbar">
          <div className="filters">
            <span className="filter-label">
              <Filter size={13} />
              Filter
            </span>

            <button
              className={`filter-button ${
                filter === "ALL"
                  ? "active"
                  : ""
              }`}
              onClick={() => setFilter("ALL")}
            >
              All
            </button>

            <button
              className={`filter-button ${
                filter === "LOW"
                  ? "active"
                  : ""
              }`}
              onClick={() => setFilter("LOW")}
            >
              Low risk
            </button>

            <button
              className={`filter-button ${
                filter === "MEDIUM"
                  ? "active"
                  : ""
              }`}
              onClick={() => setFilter("MEDIUM")}
            >
              Medium risk
            </button>
          </div>

          <div className="result-count">
            Showing {filteredRecommendations.length}{" "}
            recommendations
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            Loading AI recommendations...
          </div>
        ) : error ? (
          <div className="error-state">
            {error}
          </div>
        ) : filteredRecommendations.length ===
          0 ? (
          <div className="empty-state">
            <Check
              size={34}
              className="empty-icon"
            />

            <h2>No changes need your attention</h2>

            <p>
              Autopilot has no pending recommendations
              matching this filter.
            </p>
          </div>
        ) : (
          <div className="cards">
            {filteredRecommendations.map(
              (recommendation) => (
                <article
                  className="recommendation-card"
                  key={recommendation.id}
                >
                  <div className="card-top">
                    <div className="action-type">
                      <ActionIcon
                        action={
                          recommendation.actionType
                        }
                      />

                      {formatAction(
                        recommendation.actionType
                      )}
                    </div>

                    <RiskBadge
                      risk={
                        recommendation.risk
                      }
                    />
                  </div>

                  <h2 className="card-title">
                    {recommendation.title}
                  </h2>

                  <div className="target">
                    {getTargetName(
                      recommendation
                    )}
                  </div>

                  {recommendation.currentValue !==
                    null &&
                    recommendation.recommendedValue !==
                      null ? (
                    <div className="value-box">
                      <div className="value-side">
                        <div className="value-label">
                          Current
                        </div>

                        <div className="value">
                          {formatMoney(
                            recommendation.currentValue
                          )}
                        </div>
                      </div>

                      <ChevronRight
                        className="value-arrow"
                        size={18}
                      />

                      <div className="value-side">
                        <div className="value-label">
                          Recommended
                        </div>

                        <div className="value">
                          {formatMoney(
                            recommendation.recommendedValue
                          )}
                        </div>

                        <div className="change">
                          {formatPercent(
                            recommendation.changePercent
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="value-box">
                      <div className="value-side">
                        <div className="value-label">
                          Recommended action
                        </div>

                        <div className="value">
                          <ActionIcon
                            action={
                              recommendation.actionType
                            }
                          />{" "}
                          Review
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="card-reason">
                    {recommendation.reason}
                  </div>

                  <div className="metrics">
                    <div className="metric">
                      <div className="metric-label">
                        Confidence
                      </div>

                      <div className="metric-value">
                        {confidencePercent(
                          recommendation.confidence
                        )}
                        %
                      </div>
                    </div>

                    <div className="metric">
                      <div className="metric-label">
                        Expected impact
                      </div>

                      <div className="metric-value">
                        {recommendation.expectedImpact ??
                          "Controlled"}
                      </div>
                    </div>

                    <div className="metric">
                      <div className="metric-label">
                        Data window
                      </div>

                      <div className="metric-value">
                        {recommendation.dataWindow ??
                          "7 days"}
                      </div>
                    </div>
                  </div>

                  <div className="card-footer">
                    <div className="confidence">
                      <Gauge size={14} />

                      <span>
                        AI confidence{" "}
                        <strong>
                          {confidencePercent(
                            recommendation.confidence
                          )}
                          %
                        </strong>
                      </span>
                    </div>

                    <button
                      className="review-button"
                      onClick={() =>
                        setSelected(
                          recommendation
                        )
                      }
                    >
                      Review
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </article>
              )
            )}
          </div>
        )}
      </div>

      {selected && (
        <>
          <div
            className="drawer-backdrop"
            onClick={closeDrawer}
          />

          <aside className="drawer">
            <div className="drawer-header">
              <div>
                <div className="drawer-eyebrow">
                  <Bot size={13} />
                  AI Recommendation
                </div>

                <h2 className="drawer-title">
                  {selected.title}
                </h2>
              </div>

              <button
                className="close-button"
                onClick={closeDrawer}
                disabled={executing}
              >
                <X size={16} />
              </button>
            </div>

            <div className="drawer-content">
              {actionResult?.success &&
                actionResult.execution && (
                  <div className="action-result">
                    <div className="result-heading">
                      <Check size={16} />
                      Change executed successfully
                    </div>

                    <div className="result-message">
                      {
                        actionResult.execution
                          .message
                      }
                    </div>

                    <div className="result-grid">
                      <div className="result-cell">
                        <span>Validation</span>
                        <strong>
                          PASSED
                        </strong>
                      </div>

                      <div className="result-cell">
                        <span>Policy</span>
                        <strong>
                          PASSED
                        </strong>
                      </div>

                      <div className="result-cell">
                        <span>Risk</span>
                        <strong>
                          {actionResult.risk
                            ?.level ?? "LOW"}
                        </strong>
                      </div>

                      <div className="result-cell">
                        <span>Execution</span>
                        <strong>
                          SUCCESS
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

              {actionResult?.success &&
  actionResult.execution && (
    <div className="rollback-panel">
      <div className="rollback-heading">
        <RefreshCw size={15} />
        Recovery available
      </div>

      <div className="rollback-message">
        This change was executed successfully and
        can be restored to its previous value.
      </div>

      <button
        className="rollback-button"
        onClick={() =>
          runAction(
            selected,
            "ROLLBACK"
          )
        }
        disabled={executing}
      >
        <RefreshCw size={13} />
        {executing
          ? "Rolling Back..."
          : "Rollback Change"}
      </button>
    </div>
)}

{actionResult?.success &&
  actionResult.action === "ROLLBACK" && (
    <div className="rollback-success">
      <div className="result-heading">
        <Check size={16} />
        Rollback completed successfully
      </div>

      <div className="result-message">
        {actionResult.message}
      </div>

      <div className="result-grid">
        <div className="result-cell">
          <span>Previous</span>
          <strong>
            {formatMoney(
              actionResult.previousValue ?? null
            )}
          </strong>
        </div>

        <div className="result-cell">
          <span>Restored</span>
          <strong>
            {formatMoney(
              actionResult.restoredValue ?? null
            )}
          </strong>
        </div>

        <div className="result-cell">
          <span>Entity</span>
          <strong>
            {actionResult.entityType}
          </strong>
        </div>

        <div className="result-cell">
          <span>Audit</span>
          <strong>
            SUCCESS
          </strong>
        </div>
      </div>
    </div>
)}

              {actionError && (
                <div className="action-error">
                  {actionError}
                </div>
              )}

              <section className="drawer-section">
                <div className="section-title">
                  <Sparkles size={15} />
                  What we found
                </div>

                <div className="reason-box">
                  {selected.description}
                </div>
              </section>

              <section className="drawer-section">
                <div className="section-title">
                  <TrendingUp size={15} />
                  Why it matters
                </div>

                <div className="reason-box">
                  {selected.reason}
                </div>
              </section>

              <section className="drawer-section">
                <div className="section-title">
                  <Target size={15} />
                  Recommendation data
                </div>

                <div className="detail-grid">
                  <div className="detail-card">
                    <span>Target</span>
                    <strong>
                      {getTargetName(selected)}
                    </strong>
                  </div>

                  <div className="detail-card">
                    <span>Action</span>
                    <strong>
                      {formatAction(
                        selected.actionType
                      )}
                    </strong>
                  </div>

                  <div className="detail-card">
                    <span>Confidence</span>
                    <strong>
                      {confidencePercent(
                        selected.confidence
                      )}
                      %
                    </strong>
                  </div>

                  <div className="detail-card">
                    <span>Risk</span>
                    <strong>
                      {selected.risk}
                    </strong>
                  </div>

                  <div className="detail-card">
                    <span>Current</span>
                    <strong>
                      {formatMoney(
                        selected.currentValue
                      )}
                    </strong>
                  </div>

                  <div className="detail-card">
                    <span>Recommended</span>
                    <strong>
                      {formatMoney(
                        selected.recommendedValue
                      )}
                    </strong>
                  </div>
                </div>
              </section>

              {selected.keyword && (
                <section className="drawer-section">
                  <div className="section-title">
                    <Zap size={15} />
                    Keyword performance
                  </div>

                  <div className="detail-grid">
                    <div className="detail-card">
                      <span>Clicks</span>
                      <strong>
                        {selected.keyword.clicks}
                      </strong>
                    </div>

                    <div className="detail-card">
                      <span>Orders</span>
                      <strong>
                        {selected.keyword.orders}
                      </strong>
                    </div>

                    <div className="detail-card">
                      <span>Spend</span>
                      <strong>
                        {formatMoney(
                          selected.keyword.spend
                        )}
                      </strong>
                    </div>

                    <div className="detail-card">
                      <span>ACoS</span>
                      <strong>
                        {(
                          selected.keyword.acos *
                          100
                        ).toFixed(1)}
                        %
                      </strong>
                    </div>
                  </div>
                </section>
              )}

              {selected.searchTerm && (
                <section className="drawer-section">
                  <div className="section-title">
                    <Target size={15} />
                    Search term performance
                  </div>

                  <div className="detail-grid">
                    <div className="detail-card">
                      <span>Clicks</span>
                      <strong>
                        {selected.searchTerm.clicks}
                      </strong>
                    </div>

                    <div className="detail-card">
                      <span>Orders</span>
                      <strong>
                        {selected.searchTerm.orders}
                      </strong>
                    </div>

                    <div className="detail-card">
                      <span>Spend</span>
                      <strong>
                        {formatMoney(
                          selected.searchTerm.spend
                        )}
                      </strong>
                    </div>

                    <div className="detail-card">
                      <span>ACoS</span>
                      <strong>
                        {(
                          selected.searchTerm.acos *
                          100
                        ).toFixed(1)}
                        %
                      </strong>
                    </div>
                  </div>
                </section>
              )}

              <section className="drawer-section">
                <div className="section-title">
                  <ShieldCheck size={15} />
                  Safety checks
                </div>

                {actionResult?.validation ? (
                  <div className="check-list">
                    {actionResult.validation.checks.map(
                      (check) => (
                        <div
                          className="check"
                          key={check.name}
                        >
                          <div
                            className={`check-icon ${
                              check.passed
                                ? ""
                                : "failed"
                            }`}
                          >
                            {check.passed ? (
                              <Check size={12} />
                            ) : (
                              <AlertTriangle
                                size={12}
                              />
                            )}
                          </div>

                          <div className="check-text">
                            <strong>
                              {check.name}
                            </strong>

                            <span>
                              {check.message}
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="check-list">
                    <div className="check">
                      <div className="check-icon">
                        <Check size={12} />
                      </div>

                      <div className="check-text">
                        <strong>
                          Recommendation is pending
                        </strong>

                        <span>
                          The recommendation has not
                          been executed yet.
                        </span>
                      </div>
                    </div>

                    <div className="check">
                      <div className="check-icon">
                        <Check size={12} />
                      </div>

                      <div className="check-text">
                        <strong>
                          AI confidence
                        </strong>

                        <span>
                          Confidence is{" "}
                          {confidencePercent(
                            selected.confidence
                          )}
                          %.
                        </span>
                      </div>
                    </div>

                    <div className="check">
                      <div className="check-icon">
                        <Check size={12} />
                      </div>

                      <div className="check-text">
                        <strong>
                          Risk classification
                        </strong>

                        <span>
                          This recommendation is
                          classified as{" "}
                          {selected.risk} risk.
                        </span>
                      </div>
                    </div>

                    {selected.changePercent !==
                      null &&
                      selected.actionType.includes(
                        "BID"
                      ) && (
                        <div className="check">
                          <div className="check-icon">
                            <Check size={12} />
                          </div>

                          <div className="check-text">
                            <strong>
                              15% bid safety boundary
                            </strong>

                            <span>
                              Proposed change is{" "}
                              {Math.abs(
                                selected.changePercent
                              ).toFixed(1)}
                              %, within the configured
                              boundary.
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </section>

              <section className="drawer-section">
                <div className="section-title">
                  <Clock3 size={15} />
                  Expected impact
                </div>

                <div className="reason-box">
                  {selected.expectedImpact ??
                    "Controlled optimization based on recent campaign performance."}
                </div>
              </section>

              <div className="drawer-actions">
                {selected.status === "PENDING" && (
                  <>
                              <button
                  className="drawer-action secondary-button"
                  onClick={() => runAction(selected, "REJECT")}
                  disabled={executing}
                >
                  <X size={13} />
                  {executing ? "Processing..." : "Reject"}
                </button>

                <button
                  className="drawer-action execute-button"
                  onClick={() => runAction(selected, "APPROVE")}
                  disabled={executing}
                >
                  <Check size={13} />
                  {executing ? "Processing..." : "Approve"}
                </button>
              </>
            )}

            {selected.status === "APPROVED" && (
              <button
                className="drawer-action execute-button"
                onClick={() => runAction(selected, "EXECUTE")}
                disabled={executing}
              >
                <Zap size={13} />
                {executing ? "Executing..." : "Execute Approved Change"}
              </button>
            )}
          </div>
            </div>
          </aside>
        </>
      )}
    </main>
  );
}
