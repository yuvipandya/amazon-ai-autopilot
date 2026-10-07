import { prisma } from "@/lib/prisma";

export type ApprovalSource = "HUMAN_APPROVAL" | "AUTOPILOT_POLICY";

export interface AuthorizationInput {

  organizationId?: string;
  amazonAccountId: string;
  recommendationId?: string;
  actionType: string;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  approvalSource: ApprovalSource;
  actor?: string; // User ID or "AUTOPILOT_ENGINE"
  idempotencyKey?: string;

  // Values for limit checks
  currentValue?: number | null;
  recommendedValue?: number | null;
  changePercent?: number | null;

  // Entity references for ownership checks
  entityType?: "keyword" | "campaign" | "searchTerm";
  entityId?: string;
}

export interface AuthorizationCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface AuthorizationResult {
  authorized: boolean;
  approvalSource: ApprovalSource;
  reason: string;
  checks: AuthorizationCheck[];
}

const ABSOLUTE_MAX_BID_CHANGE_PERCENT = 15;
const DEFAULT_MAX_BUDGET_CHANGE_PERCENT = 20;

const SUPPORTED_ACTIONS = [
  "INCREASE_BID",
  "DECREASE_BID",
  "INCREASE_BUDGET",
  "DECREASE_BUDGET",
  "HARVEST_KEYWORD",
  "ADD_NEGATIVE_KEYWORD",
];

/**
 * Single Server-Side Authorization Boundary
 *
 * Every write operation targeting Amazon (or simulation of Amazon) MUST pass through this check.
 * Safety ceilings, kill switch, entity ownership, and separation of HUMAN_APPROVAL vs AUTOPILOT_POLICY
 * are strictly enforced here. A boolean cannot bypass these checks.
 */
export async function authorizeExecution(
  input: AuthorizationInput
): Promise<AuthorizationResult> {
  const checks: AuthorizationCheck[] = [];

  // 1. Account existence and organization isolation
  const account = await prisma.amazonAccount.findUnique({
    where: { id: input.amazonAccountId },
    include: { organization: true },
  });

  if (!account) {
    checks.push({
      name: "Account existence",
      passed: false,
      message: `Amazon account ${input.amazonAccountId} was not found.`,
    });
    return {
      authorized: false,
      approvalSource: input.approvalSource,
      reason: "Amazon account not found.",
      checks,
    };
  }

  checks.push({
    name: "Account existence",
    passed: true,
    message: `Account "${account.sellerName}" verified.`,
  });

  if (input.organizationId && account.organizationId !== input.organizationId) {
    checks.push({
      name: "Organization ownership",
      passed: false,
      message: `Amazon account does not belong to organization ${input.organizationId}.`,
    });
    return {
      authorized: false,
      approvalSource: input.approvalSource,
      reason: "Cross-organization access rejected.",
      checks,
    };
  }

  // 2. Kill switch check (Authoritative across both human and autopilot)
  if (account.automationPaused) {
    checks.push({
      name: "Kill switch",
      passed: false,
      message: "Emergency kill switch is ACTIVE. All Amazon writes are paused.",
    });
    return {
      authorized: false,
      approvalSource: input.approvalSource,
      reason: "Automation is paused by kill switch. Writes are disabled.",
      checks,
    };
  }
  checks.push({
    name: "Kill switch",
    passed: true,
    message: "Automation is active and not paused.",
  });

  // 3. Account status
  if (account.status !== "ACTIVE") {
    checks.push({
      name: "Account status",
      passed: false,
      message: `Account status is ${account.status}. Must be ACTIVE to execute writes.`,
    });
    return {
      authorized: false,
      approvalSource: input.approvalSource,
      reason: `Account status is ${account.status}.`,
      checks,
    };
  }
  checks.push({
    name: "Account status",
    passed: true,
    message: "Account status is ACTIVE.",
  });

  // 4. Supported Action Check
  if (!SUPPORTED_ACTIONS.includes(input.actionType)) {
    checks.push({
      name: "Supported action",
      passed: false,
      message: `Action ${input.actionType} is not supported by the execution boundary.`,
    });
    return {
      authorized: false,
      approvalSource: input.approvalSource,
      reason: "Unsupported action type.",
      checks,
    };
  }
  checks.push({
    name: "Supported action",
    passed: true,
    message: `Action ${input.actionType} is supported.`,
  });
// 5. Model risk is informational only.
  // LLM-generated risk must never authorize or block execution.
  checks.push({
    name: "Model risk (informational)",
    passed: true,
    message: `Model-provided risk is informational only (${input.risk}).`,
  });
  
  // 6. Hard safety limits (bid 15% ceiling and budget limit)
  if (input.actionType === "INCREASE_BID" || input.actionType === "DECREASE_BID") {
    const cur = input.currentValue;
    const rec = input.recommendedValue;

    if (cur !== null && cur !== undefined && rec !== null && rec !== undefined && cur > 0) {
      const actualPct = Math.abs(((rec - cur) / cur) * 100);
      const effectiveBidLimit = Math.min(
        account.maxBidChange || ABSOLUTE_MAX_BID_CHANGE_PERCENT,
        ABSOLUTE_MAX_BID_CHANGE_PERCENT
      );

      const withinLimit = actualPct <= effectiveBidLimit + 0.0001;
      checks.push({
        name: "Hard 15% bid safety ceiling",
        passed: withinLimit,
        message: withinLimit
          ? `Bid change ${actualPct.toFixed(2)}% is within the ${effectiveBidLimit}% safety ceiling.`
          : `Bid change ${actualPct.toFixed(2)}% EXCEEDS the ${effectiveBidLimit}% safety ceiling.`,
      });

      if (!withinLimit) {
        return {
          authorized: false,
          approvalSource: input.approvalSource,
          reason: `Bid adjustment exceeds the hard ${effectiveBidLimit}% safety ceiling.`,
          checks,
        };
      }
    }
  }

  if (input.actionType === "INCREASE_BUDGET" || input.actionType === "DECREASE_BUDGET") {
    const cur = input.currentValue;
    const rec = input.recommendedValue;

    if (cur !== null && cur !== undefined && rec !== null && rec !== undefined && cur > 0) {
      const actualPct = Math.abs(((rec - cur) / cur) * 100);
      const budgetLimit = account.maxBudgetChange || DEFAULT_MAX_BUDGET_CHANGE_PERCENT;
      const withinLimit = actualPct <= budgetLimit + 0.0001;

      checks.push({
        name: "Budget safety bound",
        passed: withinLimit,
        message: withinLimit
          ? `Budget change ${actualPct.toFixed(2)}% is within the ${budgetLimit}% limit.`
          : `Budget change ${actualPct.toFixed(2)}% EXCEEDS the ${budgetLimit}% limit.`,
      });

      if (!withinLimit) {
        return {
          authorized: false,
          approvalSource: input.approvalSource,
          reason: `Budget adjustment exceeds the ${budgetLimit}% safety bound.`,
          checks,
        };
      }
    }
  }

  // 7. Separation of HUMAN_APPROVAL vs AUTOPILOT_POLICY and Automation Levels
  if (input.approvalSource === "AUTOPILOT_POLICY") {
    if (account.automationLevel < 3) {
      checks.push({
        name: "Autopilot policy authorization",
        passed: false,
        message: `Account is configured for Automation Level ${account.automationLevel}. Autonomous writes require Level 3.`,
      });
      return {
        authorized: false,
        approvalSource: input.approvalSource,
        reason: "Autonomous autopilot execution is only permitted at Level 3.",
        checks,
      };
    }

    checks.push({
      name: "Autopilot policy authorization",
      passed: true,
      message: "Level 3 Autopilot permits autonomous execution subject to deterministic policy and safety checks.",
    });
  } else {
    // HUMAN_APPROVAL workflow
    if (account.automationLevel === 1) {
      checks.push({
        name: "Level 1 Analysis Only",
        passed: false,
        message: "Account is in Level 1 (Analysis Only). Amazon writes are not allowed.",
      });
      return {
        authorized: false,
        approvalSource: input.approvalSource,
        reason: "Account is in Level 1 (Analysis Only).",
        checks,
      };
    }

    checks.push({
      name: "Human approval workflow",
      passed: true,
      message: `Human approval accepted for Level ${account.automationLevel} mode.`,
    });
  }

  // 8. Autonomous execution is strictly bid-only.
  // HUMAN_APPROVAL retains the existing behavior.
  if (
    input.approvalSource === "AUTOPILOT_POLICY" &&
    input.actionType !== "INCREASE_BID" &&
    input.actionType !== "DECREASE_BID"
  ) {
    checks.push({
      name: "Autopilot bid-only policy",
      passed: false,
      message: `Autonomous execution is restricted to bid adjustments. Action ${input.actionType} requires HUMAN_APPROVAL.`,
    });
    return {
      authorized: false,
      approvalSource: input.approvalSource,
      reason: "Autonomous execution is restricted to bid adjustments.",
      checks,
    };
  }

  // 9. Entity ownership check
  if (input.entityType && input.entityId) {
    if (input.entityType === "keyword") {
      const kw = await prisma.keyword.findUnique({
        where: { id: input.entityId },
        include: { campaign: true },
      });
      const owned = kw?.campaign.amazonAccountId === account.id;
      checks.push({
        name: "Keyword entity ownership",
        passed: Boolean(owned),
        message: owned ? "Keyword belongs to this account." : "Keyword does not belong to this account.",
      });
      if (!owned) {
        return {
          authorized: false,
          approvalSource: input.approvalSource,
          reason: "Entity ownership check failed.",
          checks,
        };
      }
    } else if (input.entityType === "campaign") {
      const camp = await prisma.campaign.findUnique({
        where: { id: input.entityId },
      });
      const owned = camp?.amazonAccountId === account.id;
      checks.push({
        name: "Campaign entity ownership",
        passed: Boolean(owned),
        message: owned ? "Campaign belongs to this account." : "Campaign does not belong to this account.",
      });
      if (!owned) {
        return {
          authorized: false,
          approvalSource: input.approvalSource,
          reason: "Entity ownership check failed.",
          checks,
        };
      }
    }
  }

  const passed = checks.every((c) => c.passed);
  return {
    authorized: passed,
    approvalSource: input.approvalSource,
    reason: passed
      ? "All server-side authorization and safety boundary checks passed."
      : "One or more authorization checks failed.",
    checks,
  };
}
