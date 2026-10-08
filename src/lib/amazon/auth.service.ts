import { AmazonCredentials, AmazonProfile } from "./types";

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

export const AMAZON_ENDPOINTS = {
  tokenUrl: "https://api.amazon.com/auth/o2/token",
  advertising: {
    na: "https://advertising-api.amazon.com",
    eu: "https://advertising-api-eu.amazon.com",
    fe: "https://advertising-api-fe.amazon.com",
  },
  spApi: {
    na: "https://sellingpartnerapi-na.amazon.com",
    eu: "https://sellingpartnerapi-eu.amazon.com",
    fe: "https://sellingpartnerapi-fe.amazon.com",
  },
};

export class AmazonAuthService {
  static getCredentialStatus(
    accountCredentials?: Partial<AmazonCredentials> | null
  ): {
    configured: boolean;
    missingFields: string[];
    region: string;
  } {
    const clientId =
      accountCredentials?.clientId || process.env.AMAZON_ADS_CLIENT_ID;

    const clientSecret =
      accountCredentials?.clientSecret ||
      process.env.AMAZON_ADS_CLIENT_SECRET;

    const refreshToken =
      accountCredentials?.refreshToken ||
      process.env.AMAZON_ADS_REFRESH_TOKEN;

    const region =
      accountCredentials?.region ||
      (process.env.AMAZON_ADS_REGION as "na" | "eu" | "fe") ||
      "eu";

    const missingFields: string[] = [];

    if (!clientId) {
      missingFields.push("clientId (AMAZON_ADS_CLIENT_ID)");
    }

    if (!clientSecret) {
      missingFields.push("clientSecret (AMAZON_ADS_CLIENT_SECRET)");
    }

    if (!refreshToken) {
      missingFields.push("refreshToken (AMAZON_ADS_REFRESH_TOKEN)");
    }

    return {
      configured: missingFields.length === 0,
      missingFields,
      region,
    };
  }

  static getEffectiveCredentials(
    accountCredentials?: Partial<AmazonCredentials> | null
  ): AmazonCredentials | null {
    const clientId =
      accountCredentials?.clientId || process.env.AMAZON_ADS_CLIENT_ID;

    const clientSecret =
      accountCredentials?.clientSecret ||
      process.env.AMAZON_ADS_CLIENT_SECRET;

    const refreshToken =
      accountCredentials?.refreshToken ||
      process.env.AMAZON_ADS_REFRESH_TOKEN;

    const profileId =
      accountCredentials?.profileId || process.env.AMAZON_ADS_PROFILE_ID;

    const region = (
      accountCredentials?.region ||
      process.env.AMAZON_ADS_REGION ||
      "eu"
    ) as "na" | "eu" | "fe";

    if (!clientId || !clientSecret || !refreshToken || !profileId) {
      return null;
    }

    return {
      clientId,
      clientSecret,
      refreshToken,
      profileId,
      region,
    };
  }

  static async getAccessToken(
    credentials: AmazonCredentials
  ): Promise<string> {
    const cacheKey = credentials.clientId;
    const cached = tokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
      return cached.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    });

    const response = await fetch(AMAZON_ENDPOINTS.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();

      let parsedError = "";

      try {
        const errorJson = JSON.parse(errorText);

        parsedError =
          errorJson.error_description ||
          errorJson.error ||
          errorText;
      } catch {
        parsedError = errorText;
      }

      throw new Error(
        `Amazon LWA token exchange failed (${response.status}): ${parsedError}`
      );
    }

    const data = await response.json();
    const accessToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) || 3600;

    tokenCache.set(cacheKey, {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });

    return accessToken;
  }

  static async discoverProfiles(
    credentials: AmazonCredentials
  ): Promise<AmazonProfile[]> {
    const accessToken = await this.getAccessToken(credentials);
    const endpoint = AMAZON_ENDPOINTS.advertising[credentials.region];

    const response = await fetch(`${endpoint}/v2/profiles`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Amazon-Advertising-API-ClientId": credentials.clientId,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.text();

      throw new Error(
        `Amazon Ads profile discovery failed (${response.status}): ${err}`
      );
    }

    return (await response.json()) as AmazonProfile[];
  }
}
