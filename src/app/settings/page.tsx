import { prisma } from "@/lib/prisma";
import SettingsControls from "./SettingsControls";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const account = await prisma.amazonAccount.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!account) {
    return (
      <main className="settings-page">
        <div className="settings-empty">
          <h1>Autopilot Settings</h1>
          <p>No Amazon account is configured yet.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="settings-page">
      <div className="settings-header">
        <div>
          <div className="settings-eyebrow">AUTOPILOT CONTROL CENTER</div>
          <h1>Settings</h1>
          <p>
            Control how AI recommendations are analyzed, approved, and
            executed for {account.sellerName}.
          </p>
        </div>

        <div
          className={`settings-status ${
            account.automationPaused ? "paused" : "active"
          }`}
        >
          <span className="settings-status-dot" />
          {account.automationPaused ? "Automation Paused" : "Automation Active"}
        </div>
      </div>

      <SettingsControls
        account={{
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
        }}
      />
    </main>
  );
}