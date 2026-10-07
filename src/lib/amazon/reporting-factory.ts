import { AmazonAuthService } from "./auth.service";
import { AmazonReportingService } from "./reporting.service";
import { IAmazonReportingService } from "./reporting.interface";
import { MockAmazonReportingService } from "./mock-reporting.service";
import { AmazonCredentials } from "./types";

interface AccountWithReportingCredentials {
  isLiveAccount?: boolean;
  lwaClientId?: string | null;
  lwaClientSecret?: string | null;
  lwaRefreshToken?: string | null;
  profileId?: string | null;
  region?: string | null;
}

export function getAmazonReportingService(
  account?: AccountWithReportingCredentials | null
): {
  service: IAmazonReportingService;
  mode: "DEMO" | "REAL";
  diagnostic: {
    configured: boolean;
    missingFields: string[];
  };
} {
  const credentials: Partial<AmazonCredentials> = {
    clientId: account?.lwaClientId || undefined,
    clientSecret: account?.lwaClientSecret || undefined,
    refreshToken: account?.lwaRefreshToken || undefined,
    profileId: account?.profileId || undefined,
    region:
      (account?.region as "na" | "eu" | "fe") ||
      undefined,
  };

  const status =
    AmazonAuthService.getCredentialStatus(credentials);

  const effectiveCreds =
    AmazonAuthService.getEffectiveCredentials(credentials);

  if (
    account?.isLiveAccount &&
    status.configured &&
    effectiveCreds
  ) {
    return {
      service: new AmazonReportingService(effectiveCreds),
      mode: "REAL",
      diagnostic: status,
    };
  }

  return {
    service: new MockAmazonReportingService(),
    mode: "DEMO",
    diagnostic: status,
  };
}
