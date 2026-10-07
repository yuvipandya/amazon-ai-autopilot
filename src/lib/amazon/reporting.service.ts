import { gunzipSync } from "node:zlib";
import { AmazonAuthService, AMAZON_ENDPOINTS } from "./auth.service";
import {
  AmazonCredentials,
  AmazonSearchTerm,
  AmazonSearchTermRow,
} from "./types";

interface CreateReportResponse {
  reportId: string;
}

interface ReportStatusResponse {
  reportId: string;
  status: string;
  url?: string;
  failureReason?: string;
}

export class AmazonReportingService {
  private readonly credentials: AmazonCredentials;

  constructor(credentials: AmazonCredentials) {
    this.credentials = credentials;
  }

  private getBaseUrl(): string {
    return AMAZON_ENDPOINTS.advertising[this.credentials.region];
  }

  private async request<T>(
    path: string,
    options: {
      method: "GET" | "POST";
      profileId: string;
      body?: unknown;
      contentType?: string;
    }
  ): Promise<T> {
    const token = await AmazonAuthService.getAccessToken(this.credentials);

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Amazon-Advertising-API-ClientId": this.credentials.clientId,
        "Amazon-Advertising-API-Scope": options.profileId,
        "Content-Type":
          options.contentType ||
          "application/vnd.createasyncreportrequest.v3+json",
        Accept: "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Amazon reporting API error (${response.status}) on ${options.method} ${path}: ${body}`
      );
    }

    return (await response.json()) as T;
  }

  async getSearchTerms(options: {
    profileId: string;
    startDate: string;
    endDate: string;
  }): Promise<AmazonSearchTerm[]> {
    const start = new Date(`${options.startDate}T00:00:00Z`);
    const end = new Date(`${options.endDate}T00:00:00Z`);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      throw new Error("Invalid Amazon reporting date range.");
    }

    if (start > end) {
      throw new Error(
        "Amazon reporting startDate must be before endDate."
      );
    }

    const days =
      Math.floor(
        (end.getTime() - start.getTime()) /
          (24 * 60 * 60 * 1000)
      ) + 1;

    if (days > 31) {
      throw new Error(
        `Amazon search-term reports support a maximum 31-day date range. Requested ${days} days.`
      );
    }

    const createResponse =
      await this.request<CreateReportResponse>(
        "/reporting/reports",
        {
          method: "POST",
          profileId: options.profileId,
          body: {
            name: `Amazon AI Autopilot Search Terms ${options.startDate} to ${options.endDate}`,
            startDate: options.startDate,
            endDate: options.endDate,
            configuration: {
              adProduct: "SPONSORED_PRODUCTS",
              groupBy: ["searchTerm"],
              columns: [
                "impressions",
                "clicks",
                "cost",
                "campaignId",
                "campaignName",
                "adGroupId",
                "adGroupName",
                "keywordId",
                "keyword",
                "keywordType",
                "matchType",
                "targeting",
                "searchTerm",
                "date",
                "startDate",
                "endDate",
                "purchases1d",
                "purchases7d",
                "purchases14d",
                "sales1d",
                "sales7d",
                "sales14d",
                "unitsSoldClicks1d",
                "unitsSoldClicks7d",
                "unitsSoldClicks14d",
              ],
              reportTypeId: "spSearchTerm",
              timeUnit: "DAILY",
              format: "GZIP_JSON",
            },
          },
        }
      );

    if (!createResponse.reportId) {
      throw new Error(
        "Amazon reporting API did not return a reportId."
      );
    }

    const report = await this.waitForReport(
      createResponse.reportId,
      options.profileId
    );

    if (!report.url) {
      throw new Error(
        "Amazon completed report without a download URL."
      );
    }

    const rows = await this.downloadRows(report.url);

    return rows
      .map((row) => this.normalizeRow(row))
      .filter(
        (row): row is AmazonSearchTerm => row !== null
      );
  }

  private async waitForReport(
    reportId: string,
    profileId: string
  ): Promise<ReportStatusResponse> {
    const maxAttempts = 36;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status =
        await this.request<ReportStatusResponse>(
          `/reporting/reports/${encodeURIComponent(reportId)}`,
          {
            method: "GET",
            profileId,
          }
        );

      if (status.status === "COMPLETED") {
        return status;
      }

      if (status.status === "FAILURE") {
        throw new Error(
          `Amazon search-term report failed: ${
            status.failureReason || "Unknown failure"
          }`
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 5000)
      );
    }

    throw new Error(
      `Amazon search-term report ${reportId} did not complete within the polling window.`
    );
  }

  private async downloadRows(
    url: string
  ): Promise<AmazonSearchTermRow[]> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Amazon report download failed with HTTP ${response.status}.`
      );
    }

    const bytes = Buffer.from(
      await response.arrayBuffer()
    );

    let text: string;

    try {
      text = gunzipSync(bytes).toString("utf8");
    } catch {
      text = bytes.toString("utf8");
    }

    const parsed = JSON.parse(text) as unknown;

    if (Array.isArray(parsed)) {
      return parsed as AmazonSearchTermRow[];
    }

    throw new Error(
      "Amazon report download contained an unexpected format."
    );
  }

  private normalizeRow(
    row: AmazonSearchTermRow
  ): AmazonSearchTerm | null {
    const searchTerm = String(
      row.searchTerm ?? ""
    ).trim();

    const campaignId = String(
      row.campaignId ?? ""
    ).trim();

    if (!searchTerm || !campaignId) {
      return null;
    }

    const numberValue = (
      value: number | string | undefined
    ): number => {
      const parsed = Number(value ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const orders = Math.max(
      numberValue(row.purchases14d),
      numberValue(row.purchases7d),
      numberValue(row.purchases1d)
    );

    const sales = Math.max(
      numberValue(row.sales14d),
      numberValue(row.sales7d),
      numberValue(row.sales1d)
    );

    return {
      amazonSearchTermId:
        `${campaignId}:${searchTerm}`,
      campaignId,
      searchTerm,
      date:
        row.date ||
        row.startDate ||
        row.endDate,
      keywordId:
        row.keywordId === undefined
          ? undefined
          : String(row.keywordId),
      adGroupId:
        row.adGroupId === undefined
          ? undefined
          : String(row.adGroupId),
      keyword: row.keyword,
      keywordType: row.keywordType,
      matchType: row.matchType,
      targeting: row.targeting,
      impressions: Math.max(
        0,
        Math.round(numberValue(row.impressions))
      ),
      clicks: Math.max(
        0,
        Math.round(numberValue(row.clicks))
      ),
      orders: Math.max(
        0,
        Math.round(orders)
      ),
      spend: Math.max(
        0,
        numberValue(row.cost)
      ),
      sales: Math.max(
        0,
        sales
      ),
    };
  }
}
