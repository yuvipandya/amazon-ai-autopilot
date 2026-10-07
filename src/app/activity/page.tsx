"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity as ActivityIcon,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  RefreshCw,
  ShieldCheck,
  Target,
  X,
  Zap,
} from "lucide-react";

type ActivityLog = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string;
  aiModel: string | null;
  promptVersion: string | null;
  strategyVersion: string | null;
  confidence: number | null;
  approvalStatus: string;
  executionResult: string;
  rawResponse: string | null;
  rollbackInfo: string | null;
  createdAt: string;

  recommendation?: {
    id: string;
    title: string;
    actionType: string;
    risk: string;
    product?: {
      id: string;
      asin: string;
      title: string;
    } | null;
    campaign?: {
      id: string;
      name: string;
    } | null;
    keyword?: {
      id: string;
      value: string;
      matchType: string;
    } | null;
    searchTerm?: {
      id: string;
      value: string;
      classification: string;
    } | null;
  } | null;
};

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    INCREASE_BID: "Bid increased",
    DECREASE_BID: "Bid decreased",
    INCREASE_BUDGET: "Budget increased",
    DECREASE_BUDGET: "Budget decreased",
    HARVEST_KEYWORD: "Keyword harvested",
    ADD_NEGATIVE_KEYWORD: "Negative keyword added",
    IGNORE: "Recommendation ignored",
    LOCK: "Recommendation locked",
  };

  return (
    labels[action] ??
    action
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

function getEntityName(log: ActivityLog) {
  if (log.recommendation?.keyword) {
    return log.recommendation.keyword.value;
  }

  if (log.recommendation?.searchTerm) {
    return log.recommendation.searchTerm.value;
  }

  if (log.recommendation?.campaign) {
    return log.recommendation.campaign.name;
  }

  if (log.recommendation?.product) {
    return log.recommendation.product.title;
  }

  return log.entityType.replaceAll("_", " ");
}

function formatValue(value: string | null) {
  if (value === null || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isNaN(number)) {
    return `₹${number.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return value;
}

function formatTime(date: string) {
  const value = new Date(date);

  return value.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatActionIcon(action: string) {
  if (
    action === "INCREASE_BID" ||
    action === "INCREASE_BUDGET"
  ) {
    return <ArrowUpRight size={16} />;
  }

  if (
    action === "DECREASE_BID" ||
    action === "DECREASE_BUDGET"
  ) {
    return <ArrowDownRight size={16} />;
  }

  if (action === "HARVEST_KEYWORD") {
    return <Target size={16} />;
  }

  return <ShieldCheck size={16} />;
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [selected, setSelected] =
    useState<ActivityLog | null>(null);

  const [filter, setFilter] = useState<
    "ALL" | "SUCCESS" | "IGNORED"
  >("ALL");

  const loadActivity = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const response = await fetch(
          "/api/activity",
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load activity (${response.status})`
          );
        }

        const json = await response.json();

        setLogs(json?.data?.logs ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load activity."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const filteredLogs = useMemo(() => {
    if (filter === "ALL") {
      return logs;
    }

    return logs.filter((log) =>
      filter === "SUCCESS"
        ? log.executionResult === "SUCCESS"
        : log.executionResult === "IGNORED"
    );
  }, [logs, filter]);

  const successCount = logs.filter(
    (log) => log.executionResult === "SUCCESS"
  ).length;

  const ignoredCount = logs.filter(
    (log) => log.executionResult === "IGNORED"
  ).length;

  return (
    <main className="activity-page">
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

        .activity-page {
          min-height: 100vh;
          padding: 34px 38px 60px;
          background:
            radial-gradient(
              circle at 80% 5%,
              rgba(124, 58, 237, 0.07),
              transparent 28%
            ),
            #080a0f;
        }

        .activity-shell {
          max-width: 1320px;
          margin: 0 auto;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 28px;
        }

        .eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #a78bfa;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }

        h1 {
          margin: 0;
          font-size: 34px;
          letter-spacing: -0.04em;
        }

        .subtitle {
          margin: 9px 0 0;
          color: #7e8799;
          font-size: 14px;
        }

        .refresh {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #242a35;
          border-radius: 10px;
          background: #11141b;
          color: #c9ced8;
          padding: 10px 14px;
          cursor: pointer;
        }

        .refresh:hover {
          background: #171b23;
        }

        .refresh:disabled {
          opacity: 0.5;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }

        .stat {
          padding: 18px;
          border: 1px solid #1e232e;
          border-radius: 14px;
          background: #10131a;
        }

        .stat-label {
          color: #737d90;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .stat-value {
          margin-top: 6px;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.04em;
        }

        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }

        .filters {
          display: flex;
          gap: 7px;
        }

        .filter {
          border: 1px solid #222833;
          background: #0f1218;
          color: #858ea0;
          padding: 8px 12px;
          border-radius: 9px;
          font-size: 12px;
          cursor: pointer;
        }

        .filter.active {
          background: #1b1f29;
          color: #f0f2f6;
          border-color: #424957;
        }

        .count {
          color: #687285;
          font-size: 12px;
        }

        .timeline {
          border: 1px solid #1e232e;
          border-radius: 16px;
          overflow: hidden;
          background: #0d1016;
        }

        .log-row {
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr) auto;
          gap: 16px;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #1c212b;
          transition: background 150ms ease;
        }

        .log-row:last-child {
          border-bottom: 0;
        }

        .log-row:hover {
          background: #11151d;
        }

        .log-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          color: #6ee7b7;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.16);
        }

        .log-main {
          min-width: 0;
        }

        .log-title {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
        }

        .log-title strong {
          font-size: 14px;
        }

        .success {
          color: #6ee7b7;
          background: rgba(16, 185, 129, 0.08);
          border-radius: 999px;
          padding: 4px 7px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }

        .entity {
          color: #8c95a6;
          margin-top: 5px;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .change {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          color: #dfe3ea;
          font-size: 12px;
        }

        .change span {
          color: #666f81;
        }

        .meta {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #6d7688;
          font-size: 11px;
          white-space: nowrap;
        }

        .confidence {
          color: #a6adba;
        }

        .confidence strong {
          color: #e0e4eb;
        }

        .details {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: 1px solid #292f3a;
          background: #141820;
          color: #aeb5c1;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
        }

        .details:hover {
          background: #1a1f28;
          color: #e8ebf0;
        }

        .empty {
          padding: 70px 20px;
          text-align: center;
          color: #727c8e;
        }

        .empty svg {
          color: #6ee7b7;
          margin-bottom: 10px;
        }

        .empty h2 {
          margin: 0 0 6px;
          color: #dfe3ea;
          font-size: 18px;
        }

        .empty p {
          margin: 0;
          font-size: 13px;
        }

        .error {
          padding: 30px;
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 12px;
          background: rgba(239, 68, 68, 0.06);
        }

        .backdrop {
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
          width: min(560px, 100vw);
          overflow-y: auto;
          background: #0d1016;
          border-left: 1px solid #272d38;
          z-index: 101;
          box-shadow: -25px 0 70px rgba(0, 0, 0, 0.35);
        }

        .drawer-header {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
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
        }

        .close {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 1px solid #282e39;
          border-radius: 9px;
          background: #12151c;
          color: #8b94a5;
          cursor: pointer;
        }

        .drawer-body {
          padding: 22px;
        }

        .section {
          margin-bottom: 24px;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #dfe3ea;
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 10px;
        }

        .section-title svg {
          color: #8b5cf6;
        }

        .reason {
          padding: 14px;
          border: 1px solid #222833;
          border-radius: 11px;
          background: #10131a;
          color: #9da6b5;
          font-size: 13px;
          line-height: 1.6;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .detail {
          padding: 12px;
          border: 1px solid #202631;
          border-radius: 10px;
          background: #10131a;
        }

        .detail span {
          display: block;
          color: #697286;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .detail strong {
          display: block;
          color: #e1e5eb;
          font-size: 13px;
          margin-top: 5px;
          word-break: break-word;
        }

        .result-success {
          color: #6ee7b7;
        }

        .result-failed {
          color: #f87171;
        }

        @media (max-width: 800px) {
          .activity-page {
            padding: 22px 14px 40px;
          }

          .header {
            flex-direction: column;
          }

          .stats {
            grid-template-columns: 1fr;
          }

          .log-row {
            grid-template-columns: 38px 1fr;
          }

          .meta {
            grid-column: 2;
            flex-wrap: wrap;
          }
        }
      `}</style>

      <div className="activity-shell">
        <header className="header">
          <div>
            <div className="eyebrow">
              <ActivityIcon size={14} />
              Autopilot activity
            </div>

            <h1>Activity</h1>

            <p className="subtitle">
              Every action taken by Autopilot is recorded
              and traceable.
            </p>
          </div>

          <button
            className="refresh"
            onClick={() => loadActivity(true)}
            disabled={refreshing}
          >
            <RefreshCw size={14} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        <section className="stats">
          <div className="stat">
            <div className="stat-label">
              Total actions
            </div>

            <div className="stat-value">
              {logs.length}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">
              Successful
            </div>

            <div className="stat-value">
              {successCount}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">
              Ignored
            </div>

            <div className="stat-value">
              {ignoredCount}
            </div>
          </div>
        </section>

        <div className="toolbar">
          <div className="filters">
            <button
              className={`filter ${
                filter === "ALL" ? "active" : ""
              }`}
              onClick={() => setFilter("ALL")}
            >
              All
            </button>

            <button
              className={`filter ${
                filter === "SUCCESS"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setFilter("SUCCESS")
              }
            >
              Successful
            </button>

            <button
              className={`filter ${
                filter === "IGNORED"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setFilter("IGNORED")
              }
            >
              Ignored
            </button>
          </div>

          <span className="count">
            {filteredLogs.length} events
          </span>
        </div>

        {loading ? (
          <div className="empty">
            Loading activity...
          </div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : filteredLogs.length === 0 ? (
          <div className="empty">
            <Check size={32} />

            <h2>No activity yet</h2>

            <p>
              Autopilot actions will appear here after
              execution.
            </p>
          </div>
        ) : (
          <section className="timeline">
            {filteredLogs.map((log) => (
              <article
                className="log-row"
                key={log.id}
              >
                <div className="log-icon">
                  {formatActionIcon(log.action)}
                </div>

                <div className="log-main">
                  <div className="log-title">
                    <strong>
                      {actionLabel(log.action)}
                    </strong>

                    <span className="success">
                      {log.executionResult}
                    </span>
                  </div>

                  <div className="entity">
                    {getEntityName(log)}
                  </div>

                  {log.previousValue !== null ||
                  log.newValue !== null ? (
                    <div className="change">
                      <span>Change</span>

                      {formatValue(
                        log.previousValue
                      )}

                      <ChevronRight size={13} />

                      {formatValue(
                        log.newValue
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="meta">
                  <span>
                    <Clock3
                      size={12}
                      style={{
                        verticalAlign: "middle",
                        marginRight: 4,
                      }}
                    />
                    {formatTime(
                      log.createdAt
                    )}
                  </span>

                  {log.confidence !== null && (
                    <span className="confidence">
                      <strong>
                        {Math.round(
                          log.confidence * 100
                        )}
                        %
                      </strong>{" "}
                      confidence
                    </span>
                  )}

                  <button
                    className="details"
                    onClick={() =>
                      setSelected(log)
                    }
                  >
                    Details
                    <ChevronRight size={12} />
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {selected && (
        <>
          <div
            className="backdrop"
            onClick={() => setSelected(null)}
          />

          <aside className="drawer">
            <div className="drawer-header">
              <div>
                <div className="drawer-eyebrow">
                  <FileText size={13} />
                  Audit record
                </div>

                <h2 className="drawer-title">
                  {actionLabel(selected.action)}
                </h2>
              </div>

              <button
                className="close"
                onClick={() => setSelected(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="drawer-body">
              <section className="section">
                <div className="section-title">
                  <Target size={15} />
                  Entity
                </div>

                <div className="reason">
                  {getEntityName(selected)}
                </div>
              </section>

              <section className="section">
                <div className="section-title">
                  <Zap size={15} />
                  Change
                </div>

                <div className="detail-grid">
                  <div className="detail">
                    <span>
                      Previous value
                    </span>

                    <strong>
                      {formatValue(
                        selected.previousValue
                      )}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>New value</span>

                    <strong>
                      {formatValue(
                        selected.newValue
                      )}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="section">
                <div className="section-title">
                  <Bot size={15} />
                  Decision
                </div>

                <div className="reason">
                  {selected.reason}
                </div>
              </section>

              <section className="section">
                <div className="section-title">
                  <ShieldCheck size={15} />
                  Execution details
                </div>

                <div className="detail-grid">
                  <div className="detail">
                    <span>Approval</span>

                    <strong>
                      {selected.approvalStatus}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>Result</span>

                    <strong
                      className={
                        selected.executionResult ===
                        "SUCCESS"
                          ? "result-success"
                          : "result-failed"
                      }
                    >
                      {selected.executionResult}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>Confidence</span>

                    <strong>
                      {selected.confidence !==
                      null
                        ? `${Math.round(
                            selected.confidence *
                              100
                          )}%`
                        : "—"}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>AI model</span>

                    <strong>
                      {selected.aiModel ??
                        "—"}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>Strategy version</span>

                    <strong>
                      {selected.strategyVersion ??
                        "—"}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>Prompt version</span>

                    <strong>
                      {selected.promptVersion ??
                        "—"}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="section">
                <div className="section-title">
                  <RefreshCw size={15} />
                  Rollback
                </div>

                <div className="reason">
                  {selected.rollbackInfo ??
                    "No rollback information recorded."}
                </div>
              </section>
            </div>
          </aside>
        </>
      )}
    </main>
  );
}