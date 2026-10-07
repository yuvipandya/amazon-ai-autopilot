type RiskInput = {
  risk: string;
  changePercent: number | null;
  actionType: string;
};

export type RiskResult = {
  passed: boolean;
  level: string;
  reason: string;
};

export function evaluateRisk(
  input: RiskInput
): RiskResult {
  const change = Math.abs(
    input.changePercent ?? 0
  );

  if (input.risk === "CRITICAL") {
    return {
      passed: false,
      level: "CRITICAL",
      reason:
        "Critical-risk action blocked by the risk engine.",
    };
  }

  if (input.actionType.includes("BID") && change > 15) {
    return {
      passed: false,
      level: "HIGH",
      reason:
        "Bid change exceeds the hard 15% safety boundary.",
    };
  }

  if (input.risk === "HIGH") {
    return {
      passed: true,
      level: "HIGH",
      reason:
        "High-risk action requires explicit seller review.",
    };
  }

  if (input.risk === "MEDIUM") {
    return {
      passed: true,
      level: "MEDIUM",
      reason:
        "Medium-risk action requires controlled execution.",
    };
  }

  return {
    passed: true,
    level: "LOW",
    reason:
      "Risk is within the configured low-risk execution boundary.",
  };
}