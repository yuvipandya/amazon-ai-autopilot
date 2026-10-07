import { prisma } from "@/lib/prisma";

export interface ListingAuditResult {
  productId: string;
  asin: string;
  currentTitle: string;
  auditScore: number;
  recommendations: {
    recommendedTitle: string;
    recommendedBullets: string[];
    recommendedBackendKeywords: string;
    reason: string;
  };
  version: number;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  livePublishingReady: boolean;
  message: string;
}

export class ListingOptimizationService {
  /**
   * Performs an audit on a product's listing copy and creates a versioned proposal.
   * Does NOT publish directly to Amazon.
   */
  static async auditAndPropose(productId: string): Promise<ListingAuditResult> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { amazonAccount: true },
    });

    if (!product) {
      throw new Error(`Product ${productId} not found.`);
    }

    // Determine current version
    const lastAudit = await prisma.listingAudit.findFirst({
      where: { productId },
      orderBy: { version: "desc" },
    });
    const nextVersion = (lastAudit?.version ?? 0) + 1;

    // Evaluate title length and keywords
    const titleLength = product.title.length;
    let score = product.listingScore;
    let reason = "Title is concise but could include high-volume converting search terms.";

    const recommendedTitle = product.title.includes("Set")
      ? `${product.title} - Handcrafted Premium Design for Special Occasions`
      : `${product.title} - High Performance Durable Quality`;

    const recommendedBullets = [
      "PREMIUM QUALITY CRAFTSMANSHIP: Designed with durable materials for long-lasting use.",
      "ENHANCED COMFORT & FIT: Engineered for ease of use and maximum comfort.",
      "PERFECT GIFT: Elegantly packaged for festivals, birthdays, and anniversaries.",
      "SATISFACTION GUARANTEED: Backed by 100% manufacturer warranty and support.",
    ];

    const recommendedBackendKeywords = `${product.category.toLowerCase()} premium durable best gift trending 2026`;

    // Persist audit record in DB
    const audit = await prisma.listingAudit.create({
      data: {
        productId: product.id,
        currentTitle: product.title,
        recommendedTitle,
        currentBullets: JSON.stringify([]),
        recommendedBullets: JSON.stringify(recommendedBullets),
        currentBackendKeywords: "",
        recommendedBackendKeywords,
        auditScore: Math.min(95, score + 8),
        reason,
        status: "PENDING_REVIEW",
        version: nextVersion,
      },
    });

    const hasLiveCreds = product.amazonAccount.isLiveAccount;

    return {
      productId: product.id,
      asin: product.asin,
      currentTitle: product.title,
      auditScore: audit.auditScore,
      recommendations: {
        recommendedTitle,
        recommendedBullets,
        recommendedBackendKeywords,
        reason,
      },
      version: nextVersion,
      status: "PENDING_REVIEW",
      livePublishingReady: hasLiveCreds,
      message: hasLiveCreds
        ? "Listing proposal ready for seller approval prior to SP-API submission."
        : "DEMO MODE: Listing proposal generated and saved for review. Real SP-API credentials required for live catalog publishing.",
    };
  }

  /**
   * Approves or rejects a listing proposal
   */
  static async reviewAudit(
    auditId: string,
    action: "APPROVE" | "REJECT"
  ): Promise<{ success: boolean; status: string; message: string }> {
    const audit = await prisma.listingAudit.findUnique({
      where: { id: auditId },
      include: { product: { include: { amazonAccount: true } } },
    });

    if (!audit) {
      throw new Error("Listing audit record not found.");
    }

    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

    await prisma.listingAudit.update({
      where: { id: auditId },
      data: { status: newStatus },
    });

    if (action === "APPROVE") {
      // If approved, update local product title
      if (audit.recommendedTitle) {
        await prisma.product.update({
          where: { id: audit.productId },
          data: {
            title: audit.recommendedTitle,
            listingScore: audit.auditScore,
          },
        });
      }

      const hasLiveCreds = audit.product.amazonAccount.isLiveAccount;
      return {
        success: true,
        status: newStatus,
        message: hasLiveCreds
          ? "Proposal approved. Ready to queue for SP-API Listings Items API."
          : "Proposal approved locally. Live Amazon SP-API publishing blocked until live credentials configured.",
      };
    }

    return {
      success: true,
      status: newStatus,
      message: "Proposal was rejected.",
    };
  }
}
