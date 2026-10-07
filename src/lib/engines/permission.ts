type PermissionInput = {
  automationLevel: number;
  actionType: string;
  risk: string;
  explicitUserApproval: boolean;
};

export type PermissionResult = {
  allowed: boolean;
  reason: string;
};

export function evaluatePermission(
  input: PermissionInput
): PermissionResult {
  /*
   * Level 1 / 2:
   * Explicit seller action is required.
   *
   * Level 3:
   * Low-risk routine actions may be auto-executed.
   *
   * This API endpoint represents an explicit seller
   * click on "Execute", so Level 1/2 can proceed
   * after the other safety engines pass.
   */

  if (input.explicitUserApproval) {
    return {
      allowed: true,
      reason:
        "Explicit seller approval was provided through the Execute action.",
    };
  }

  if (
    input.automationLevel >= 3 &&
    input.risk === "LOW"
  ) {
    return {
      allowed: true,
      reason:
        "Level 3 automation permits this low-risk action.",
    };
  }

  return {
    allowed: false,
    reason:
      "Seller approval is required before this action can execute.",
  };
}