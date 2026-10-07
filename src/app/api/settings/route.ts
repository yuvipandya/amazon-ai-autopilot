import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AmazonAuthService } from "@/lib/amazon/auth.service";
import { requireAuth, getAuthorizedAccount } from "@/lib/auth/authorization";

const validStrategies = [
  "CONSERVATIVE",
  "BALANCED",
  "AGGRESSIVE",
] as const;

export async function GET(request: Request) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const account = accountId
      ? await getAuthorizedAccount(accountId)
      : await prisma.amazonAccount.findFirst({
          where: { organizationId: (await requireAuth()).user.organizationId },
          orderBy: { createdAt: "asc" },
        });

    if (!account) {
      return NextResponse.json({ error: "Amazon account not found" }, { status: 404 });
    }

    const credentialStatus = AmazonAuthService.getCredentialStatus({
      clientId: account.lwaClientId || undefined,
      clientSecret: account.lwaClientSecret || undefined,
      refreshToken: account.lwaRefreshToken || undefined,
      region: (account.region as "na" | "eu" | "fe") || undefined,
    });

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        sellerName: account.sellerName,
        marketplace: account.marketplace,
        strategyMode: account.strategyMode,
        automationLevel: account.automationLevel,
        maxBidChange: account.maxBidChange,
        maxBudgetChange: account.maxBudgetChange,
        automationPaused: account.automationPaused,
        isLiveAccount: account.isLiveAccount,
        profileId: account.profileId,
        region: account.region,
        hasLwaClientId: Boolean(account.lwaClientId),
        hasLwaRefreshToken: Boolean(account.lwaRefreshToken),
        syncStatus: account.syncStatus,
        lastSyncAt: account.lastSyncAt,
      },
      amazonIntegration: {
        mode: account.isLiveAccount && credentialStatus.configured ? "REAL" : "DEMO",
        configured: credentialStatus.configured,
        missingFields: credentialStatus.missingFields,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAuth();

    const body = await request.json();

    const {
      accountId,
      strategyMode,
      automationLevel,
      maxBidChange,
      maxBudgetChange,
      automationPaused,
      isLiveAccount,
      region,
      profileId,
      lwaClientId,
      lwaClientSecret,
      lwaRefreshToken,
      action, // e.g. "DISCONNECT", "TEST_CONNECTION"
    } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const account = await getAuthorizedAccount(accountId);

    if (!account) {
      return NextResponse.json(
        { error: "Amazon account not found" },
        { status: 404 }
      );
    }

    if (action === "DISCONNECT") {
      const updated = await prisma.amazonAccount.update({
        where: { id: accountId },
        data: {
          isLiveAccount: false,
          lwaClientId: null,
          lwaClientSecret: null,
          lwaRefreshToken: null,
          profileId: null,
          syncStatus: "DISCONNECTED",
        },
      });

      return NextResponse.json({
        success: true,
        message: "Disconnected Amazon live account. Switched to DEMO mode.",
        account: {
          id: updated.id,
          isLiveAccount: false,
          mode: "DEMO",
        },
      });
    }

    const data: Record<string, unknown> = {};

    if (strategyMode !== undefined) {
      if (!validStrategies.includes(strategyMode)) {
        return NextResponse.json(
          { error: "Invalid strategy mode" },
          { status: 400 }
        );
      }
      data.strategyMode = strategyMode;
    }

    if (automationLevel !== undefined) {
      const level = Number(automationLevel);
      if (![1, 2, 3].includes(level)) {
        return NextResponse.json(
          { error: "Automation level must be 1, 2, or 3" },
          { status: 400 }
        );
      }
      data.automationLevel = level;
    }

    if (maxBidChange !== undefined) {
      const value = Number(maxBidChange);
      // HARD 15% CEILING: Cannot exceed 15%
      if (!Number.isFinite(value) || value <= 0 || value > 15) {
        return NextResponse.json(
          { error: "Maximum bid change must be between 1% and 15% (Hard safety ceiling)" },
          { status: 400 }
        );
      }
      data.maxBidChange = value;
    }

    if (maxBudgetChange !== undefined) {
      const value = Number(maxBudgetChange);
      if (!Number.isFinite(value) || value <= 0 || value > 100) {
        return NextResponse.json(
          { error: "Maximum budget change must be between 1 and 100" },
          { status: 400 }
        );
      }
      data.maxBudgetChange = value;
    }

    if (automationPaused !== undefined) {
      data.automationPaused = Boolean(automationPaused);
    }

    if (isLiveAccount !== undefined) {
      data.isLiveAccount = Boolean(isLiveAccount);
    }

    if (region !== undefined) {
      if (!["na", "eu", "fe"].includes(region)) {
        return NextResponse.json({ error: "Region must be na, eu, or fe" }, { status: 400 });
      }
      data.region = region;
    }

    if (profileId !== undefined) data.profileId = profileId ? String(profileId).trim() : null;
    if (lwaClientId !== undefined) data.lwaClientId = lwaClientId ? String(lwaClientId).trim() : null;
    if (lwaClientSecret !== undefined) data.lwaClientSecret = lwaClientSecret ? String(lwaClientSecret).trim() : null;
    if (lwaRefreshToken !== undefined) data.lwaRefreshToken = lwaRefreshToken ? String(lwaRefreshToken).trim() : null;

    const updated = await prisma.amazonAccount.update({
      where: { id: accountId },
      data,
    });

    return NextResponse.json({
      success: true,
      account: {
        id: updated.id,
        strategyMode: updated.strategyMode,
        automationLevel: updated.automationLevel,
        maxBidChange: updated.maxBidChange,
        maxBudgetChange: updated.maxBudgetChange,
        automationPaused: updated.automationPaused,
        isLiveAccount: updated.isLiveAccount,
        profileId: updated.profileId,
        region: updated.region,
        syncStatus: updated.syncStatus,
      },
    });
  } catch (error) {
    console.error("SETTINGS UPDATE ERROR:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update settings",
      },
      { status: 500 }
    );
  }
}
