"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Sparkles,
  Loader2,
  TrendingUp,
} from "lucide-react";

export default function SearchTermAnalyzer({
  productId,
}: {
  productId: string;
}) {
  const [searchLoading, setSearchLoading] = useState(false);
  const [bidLoading, setBidLoading] = useState(false);

  const [searchMessage, setSearchMessage] = useState("");
  const [bidMessage, setBidMessage] = useState("");

  async function analyzeSearchTerms() {
    setSearchLoading(true);
    setSearchMessage("");

    try {
      const response = await fetch("/api/search-terms/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Analysis failed");
      }

      setSearchMessage(
        `${data.created} recommendation${
          data.created === 1 ? "" : "s"
        } created · ${data.analyzed} search terms analyzed`,
      );
    } catch (error) {
      setSearchMessage(
        error instanceof Error
          ? error.message
          : "Search-term analysis failed",
      );
    } finally {
      setSearchLoading(false);
    }
  }

  async function analyzeBids() {
    setBidLoading(true);
    setBidMessage("");

    try {
      const response = await fetch("/api/bids/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Bid analysis failed");
      }

      setBidMessage(
        `${data.created} bid recommendation${
          data.created === 1 ? "" : "s"
        } created · ${data.analyzed} keywords analyzed · Gemini ${
          data.ai?.generated ?? 0
        }`,
      );
    } catch (error) {
      setBidMessage(
        error instanceof Error
          ? error.message
          : "Bid analysis failed",
      );
    } finally {
      setBidLoading(false);
    }
  }

  return (
    <div className="search-analysis-action">
      <div>
        <strong>Run Autopilot analysis</strong>

        <p>
          Re-evaluate winning and waste search terms and optimize keyword
          bids using the latest product data.
        </p>

        {searchMessage && (
          <span className="search-analysis-result">
            <CheckCircle2 size={12} />
            {searchMessage}
          </span>
        )}

        {bidMessage && (
          <span className="search-analysis-result">
            <CheckCircle2 size={12} />
            {bidMessage}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          className="search-analysis-button"
          onClick={analyzeSearchTerms}
          disabled={searchLoading || bidLoading}
        >
          {searchLoading ? (
            <>
              <Loader2
                size={13}
                className="search-analysis-spinner"
              />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles size={13} />
              Analyze search terms
            </>
          )}
        </button>

        <button
          type="button"
          className="search-analysis-button"
          onClick={analyzeBids}
          disabled={searchLoading || bidLoading}
        >
          {bidLoading ? (
            <>
              <Loader2
                size={13}
                className="search-analysis-spinner"
              />
              Analyzing bids...
            </>
          ) : (
            <>
              <TrendingUp size={13} />
              Analyze bids
            </>
          )}
        </button>
      </div>
    </div>
  );
}