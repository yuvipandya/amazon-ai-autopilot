import { IAmazonConnector } from "./connector.interface";
import { MockAmazonConnector } from "./mock-connector";
import { RealAmazonConnector } from "./real-connector";
import { AmazonAuthService } from "./auth.service";

interface AccountWithCredentials {
  id?: string;
  isLiveAccount?: boolean;
  lwaClientId?: string | null;
  lwaClientSecret?: string | null;
  lwaRefreshToken?: string | null;
  profileId?: string | null;
  region?: string | null;
}

// Singleton mock connector for demo consistency across memory calls
let sharedMockConnector: MockAmazonConnector | null = null;

export function getAmazonConnector(
  account?: AccountWithCredentials | null
): { connector: IAmazonConnector; mode: "DEMO" | "REAL"; diagnostic: { configured: boolean; missingFields: string[] } } {
  const credentials = {
    clientId: account?.lwaClientId || undefined,
    clientSecret: account?.lwaClientSecret || undefined,
    refreshToken: account?.lwaRefreshToken || undefined,
    profileId: account?.profileId || undefined,
    region: (account?.region as "na" | "eu" | "fe") || undefined,
  };

  const status = AmazonAuthService.getCredentialStatus(credentials);
  const effectiveCreds = AmazonAuthService.getEffectiveCredentials(credentials);

  if (account?.isLiveAccount && status.configured && effectiveCreds) {
    return {
      connector: new RealAmazonConnector(effectiveCreds),
      mode: "REAL",
      diagnostic: status,
    };
  }

  // A live account whose credentials are complete except for the advertising
  // profile must not silently degrade to DEMO without saying why.
  if (account?.isLiveAccount && status.configured && !effectiveCreds) {
    status.missingFields.push("profileId (AMAZON_ADS_PROFILE_ID)");
    status.configured = false;
  }

  // Fallback to explicitly labeled DEMO mode
  if (!sharedMockConnector) {
    sharedMockConnector = new MockAmazonConnector();
  }

  return {
    connector: sharedMockConnector,
    mode: "DEMO",
    diagnostic: status,
  };
}
