"use client";

import { useState } from "react";

type StrategyMode = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";

type Account = {
  id: string;
  sellerName: string;
  marketplace: string;
  strategyMode: StrategyMode;
  automationLevel: number;
  maxBidChange: number;
  maxBudgetChange: number;
  automationPaused: boolean;
  isLiveAccount?: boolean;
  profileId?: string | null;
  region?: string | null;
  hasLwaClientId?: boolean;
};

type Props = {
  account: Account;
};

const strategies: {
  value: StrategyMode;
  label: string;
  description: string;
}[] = [
  {
    value: "CONSERVATIVE",
    label: "Conservative",
    description: "Prioritize stability and minimize aggressive changes.",
  },
  {
    value: "BALANCED",
    label: "Balanced",
    description: "Balance growth opportunities with controlled risk.",
  },
  {
    value: "AGGRESSIVE",
    label: "Aggressive",
    description: "Prioritize growth and act on stronger opportunities faster.",
  },
];

const automationLevels = [
  {
    value: 1,
    label: "Analysis Only",
    description: "AI analyzes performance but never executes changes.",
  },
  {
    value: 2,
    label: "Approval Mode",
    description: "AI recommends changes and waits for seller approval.",
  },
  {
    value: 3,
    label: "Autopilot",
    description: "Approved low-risk actions can execute automatically.",
  },
];

export default function SettingsControls({ account }: Props) {
  const [strategyMode, setStrategyMode] = useState(account.strategyMode);
  const [automationLevel, setAutomationLevel] = useState(
    account.automationLevel
  );
  const [maxBidChange, setMaxBidChange] = useState(
    Math.min(15, account.maxBidChange)
  );
  const [maxBudgetChange, setMaxBudgetChange] = useState(
    account.maxBudgetChange
  );
  const [paused, setPaused] = useState(account.automationPaused);
  const [isLive, setIsLive] = useState(Boolean(account.isLiveAccount));
  const [profileId, setProfileId] = useState(account.profileId || "");
  const [region, setRegion] = useState(account.region || "eu");
  const [lwaClientId, setLwaClientId] = useState("");
  const [lwaClientSecret, setLwaClientSecret] = useState("");
  const [lwaRefreshToken] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveSettings() {
    setSaving(true);
    setMessage("");

    try {
      const payload: Record<string, unknown> = {
        accountId: account.id,
        strategyMode,
        automationLevel,
        maxBidChange: Math.min(15, maxBidChange),
        maxBudgetChange,
        automationPaused: paused,
        isLiveAccount: isLive,
        region,
        profileId: profileId || null,
      };

      if (lwaClientId.trim()) payload.lwaClientId = lwaClientId.trim();
      if (lwaClientSecret.trim()) payload.lwaClientSecret = lwaClientSecret.trim();
      if (lwaRefreshToken.trim()) payload.lwaRefreshToken = lwaRefreshToken.trim();

      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      setMessage("Settings saved successfully.");
      setLwaClientSecret(""); // Clear secret from form memory
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to save settings"
      );
    } finally {
      setSaving(false);
    }
  }

  async function togglePause() {
    const nextPaused = !paused;

    setPaused(nextPaused);
    setMessage("");

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: account.id,
          automationPaused: nextPaused,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update automation status");
      }

      setMessage(
        nextPaused
          ? "All automation has been paused."
          : "Automation has been resumed."
      );
    } catch (error) {
      setPaused(!nextPaused);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to update automation status"
      );
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect live Amazon account and revert to DEMO mode?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, action: "DISCONNECT" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Disconnect failed");
      setIsLive(false);
      setProfileId("");
      setMessage("Disconnected Amazon live account. Switched to DEMO mode.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-grid">
      {/* Amazon Connector & Credential Architecture Section */}
      <section className="settings-card settings-card-wide">
        <div className="settings-card-header">
          <div>
            <div className="settings-card-kicker">CONNECTOR ARCHITECTURE</div>
            <h2>Amazon API Integration (LWA / SP-API)</h2>
            <p>
              Configure live Login with Amazon (LWA) credentials or operate in explicit DEMO mode.
            </p>
          </div>
          <div className={`settings-status ${isLive ? "active" : "paused"}`}>
            <span className="settings-status-dot" />
            {isLive ? "REAL AMAZON API" : "DEMO MODE (Mock Connector)"}
          </div>
        </div>

        <div style={{ marginTop: "16px", padding: "14px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ margin: 0, fontSize: "14px", color: "#a1a1aa" }}>
            <strong>Operational Note:</strong> If live Amazon Ads credentials are not configured, the system operates in explicit <strong>DEMO Mode</strong> using the Mock Amazon Connector with verified state transitions. Real credentials are never printed and live API calls are never faked.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "18px" }}>
          <div className="limit-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
            <strong>Amazon Advertising Region</strong>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              style={{ padding: "8px 12px", background: "#18181b", border: "1px solid #27272a", color: "#fafafa", borderRadius: "6px", width: "100%" }}
            >
              <option value="eu">Europe / India (advertising-api-eu.amazon.com)</option>
              <option value="na">North America (advertising-api.amazon.com)</option>
              <option value="fe">Far East / Japan (advertising-api-fe.amazon.com)</option>
            </select>
          </div>

          <div className="limit-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
            <strong>Profile ID / Scope</strong>
            <input
              type="text"
              placeholder="e.g. 1234567890123456"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              style={{ padding: "8px 12px", background: "#18181b", border: "1px solid #27272a", color: "#fafafa", borderRadius: "6px", width: "100%" }}
            />
          </div>

          <div className="limit-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
            <strong>LWA Client ID</strong>
            <input
              type="text"
              placeholder="amzn1.application-oa2-client.xxx"
              value={lwaClientId}
              onChange={(e) => setLwaClientId(e.target.value)}
              style={{ padding: "8px 12px", background: "#18181b", border: "1px solid #27272a", color: "#fafafa", borderRadius: "6px", width: "100%" }}
            />
          </div>

          <div className="limit-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
            <strong>LWA Client Secret (write-only)</strong>
            <input
              type="password"
              placeholder="••••••••••••••••••••"
              value={lwaClientSecret}
              onChange={(e) => setLwaClientSecret(e.target.value)}
              style={{ padding: "8px 12px", background: "#18181b", border: "1px solid #27272a", color: "#fafafa", borderRadius: "6px", width: "100%" }}
            />
          </div>
        </div>

        <div style={{ marginTop: "16px", display: "flex", gap: "12px", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isLive}
              onChange={(e) => setIsLive(e.target.checked)}
            />
            <span>Enable Live Amazon Connector Mode (Requires valid credentials)</span>
          </label>

          {isLive && (
            <button
              type="button"
              onClick={handleDisconnect}
              style={{ marginLeft: "auto", background: "transparent", color: "#ef4444", border: "1px solid #ef4444", padding: "6px 12px", borderRadius: "6px", cursor: "pointer" }}
            >
              Disconnect Live Account
            </button>
          )}
        </div>
      </section>

      <section className="settings-card settings-card-wide">
        <div className="settings-card-header">
          <div>
            <div className="settings-card-kicker">AI STRATEGY</div>
            <h2>Strategy Mode</h2>
            <p>Choose how aggressively Autopilot should pursue opportunities.</p>
          </div>
        </div>

        <div className="strategy-options">
          {strategies.map((strategy) => {
            const selected = strategyMode === strategy.value;

            return (
              <button
                key={strategy.value}
                type="button"
                className={`strategy-option ${selected ? "selected" : ""}`}
                onClick={() => setStrategyMode(strategy.value)}
              >
                <span className="strategy-radio">
                  {selected ? "✓" : ""}
                </span>

                <span>
                  <strong>{strategy.label}</strong>
                  <small>{strategy.description}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-card settings-card-wide">
        <div className="settings-card-header">
          <div>
            <div className="settings-card-kicker">AUTOMATION</div>
            <h2>Automation Level</h2>
            <p>Decide how much control Autopilot has over execution.</p>
          </div>
        </div>

        <div className="automation-options">
          {automationLevels.map((level) => {
            const selected = automationLevel === level.value;

            return (
              <button
                key={level.value}
                type="button"
                className={`automation-option ${
                  selected ? "selected" : ""
                }`}
                onClick={() => setAutomationLevel(level.value)}
              >
                <span className="automation-number">{level.value}</span>

                <span>
                  <strong>{level.label}</strong>
                  <small>{level.description}</small>
                </span>

                {selected && <span className="selected-check">✓</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-kicker">SAFETY LIMITS</div>
        <h2>Seller Limits</h2>
        <p className="settings-description">
          Hard deterministic limits applied before any Amazon change can execute.
        </p>

        <div className="limit-row">
          <div>
            <strong>Maximum bid change</strong>
            <span>Hard safety ceiling is 15% per cycle.</span>
          </div>

          <div className="limit-input">
            <input
              type="number"
              min="1"
              max="15"
              value={maxBidChange}
              onChange={(event) =>
                setMaxBidChange(Math.min(15, Math.max(1, Number(event.target.value))))
              }
            />
            <span>%</span>
          </div>
        </div>

        <div className="limit-row">
          <div>
            <strong>Maximum budget change</strong>
            <span>Maximum daily budget adjustment.</span>
          </div>

          <div className="limit-input">
            <input
              type="number"
              min="1"
              max="100"
              value={maxBudgetChange}
              onChange={(event) =>
                setMaxBudgetChange(Number(event.target.value))
              }
            />
            <span>%</span>
          </div>
        </div>
      </section>

      <section className="settings-card danger-card">
        <div className="settings-card-kicker">EMERGENCY CONTROL</div>
        <h2>Automation Kill Switch</h2>
        <p className="settings-description">
          Immediately stop all automated execution for this Amazon account.
        </p>

        <button
          type="button"
          className={`pause-button ${paused ? "resume" : ""}`}
          onClick={togglePause}
        >
          <span>{paused ? "▶" : "Ⅱ"}</span>
          {paused ? "Resume All Automation" : "Pause All Automation"}
        </button>

        {paused && (
          <div className="paused-warning">
            Automation is currently paused. All execution requests will be blocked.
          </div>
        )}
      </section>

      <div className="settings-save-bar">
        <div>
          {message && (
            <span
              className={
                message.includes("successfully") ||
                message.includes("resumed") ||
                message.includes("paused")
                  ? "settings-success"
                  : "settings-error"
              }
            >
              {message}
            </span>
          )}
        </div>

        <button
          type="button"
          className="settings-save-button"
          onClick={saveSettings}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}