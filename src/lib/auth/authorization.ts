import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

export async function requireAuth() {
  const session = await auth();

  if (!session?.user?.organizationId) {
    throw new Error("UNAUTHORIZED");
  }

  const expectedOrganizationId =
    process.env.AUTOPILOT_ORGANIZATION_ID;

  if (
    !expectedOrganizationId ||
    session.user.organizationId !== expectedOrganizationId
  ) {
    throw new Error("FORBIDDEN");
  }

  return session;
}

export async function getAuthorizedAccount(accountId: string) {
  const session = await requireAuth();

  return prisma.amazonAccount.findFirst({
    where: {
      id: accountId,
      organizationId: session.user.organizationId,
    },
  });
}

export async function getAuthorizedProduct(productId: string) {
  const session = await requireAuth();

  return prisma.product.findFirst({
    where: {
      id: productId,
      amazonAccount: {
        organizationId: session.user.organizationId,
      },
    },
    include: {
      amazonAccount: true,
      campaigns: {
        include: {
          searchTerms: true,
          keywords: true,
        },
      },
    },
  });
}
export async function getAuthorizedRecommendation(recommendationId: string) {
  const session = await requireAuth();

  return prisma.recommendation.findFirst({
    where: {
      id: recommendationId,
      amazonAccount: {
        organizationId: session.user.organizationId,
      },
    },
    include: {
      amazonAccount: true,
    },
  });
}

