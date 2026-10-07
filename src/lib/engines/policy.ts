type PolicyInput = {
  actionType: string;
  risk: string;
  status: string;
  accountStatus: string;
  automationLevel: number;
};

export type PolicyResult = {
  passed: boolean;
  reason: string;
  requiresApproval: boolean;
};

const SUPPORTED_ACTIONS = [
  "INCREASE_BID",
  "DECREASE_BID",
  "INCREASE_BUDGET",
  "DECREASE_BUDGET",
  "HARVEST_KEYWORD",
  "ADD_NEGATIVE_KEYWORD",
];

export function evaluatePolicy(
  input: PolicyInput
): PolicyResult {
  if (input.accountStatus !== "ACTIVE") {
    return {
      passed: false,
      reason:
        "Amazon account is not active. Automation is paused.",
      requiresApproval: true,
    };
  }

  if (!SUPPORTED_ACTIONS.includes(input.actionType)) {
    return {
      passed: false,
      reason:
        "This action type is not permitted by the current demo policy.",
      requiresApproval: true,
    };
  }

  if (input.status === "LOCKED") {
    return {
      passed: false,
      reason:
        "This recommendation has been locked by the seller.",
      requiresApproval: true,
    };
  }

  if (input.risk === "CRITICAL") {
    return {
      passed: false,
      reason:
        "Critical-risk actions cannot be executed by this demo autopilot.",
      requiresApproval: true,
    };
  }

  // Level 1 = Analysis Only.
  // Recommendations may be generated and reviewed,
  // but no execution is permitted.
  if (input.automationLevel === 1) {
    return {
      passed: false,
      reason:
        "Automation is configured for Analysis Only. Execution is disabled.",
      requiresApproval: true,
    };
  }

  // Level 2 = Approval Mode.
  // Explicit seller execution is allowed, but the action
  // must not be treated as autonomous execution.
  if (input.automationLevel === 2) {
    return {
      passed: true,
      reason:
        "Account is configured for Approval Mode. Explicit seller approval is required.",
      requiresApproval: true,
    };
  }

  // Level 3 = Autopilot.
  // Low-risk actions can pass without an additional approval requirement.
  if (input.automationLevel >= 3) {
    return {
      passed: true,
      reason:
        input.risk === "LOW"
          ? "Account is configured for Level 3 Autopilot and this is a low-risk action."
          : "Account is configured for Level 3 Autopilot, but this action requires review because of its risk level.",
      requiresApproval: input.risk !== "LOW",
    };
  }

  return {
    passed: false,
    reason: "Invalid automation level.",
    requiresApproval: true,
  };
}