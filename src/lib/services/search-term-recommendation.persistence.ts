/**
 * Idempotent persistence for search-term recommendations.
 *
 * Guarantees:
 *  - Only a recommendation that is PENDING in status, executionState AND
 *    approvalStatus may ever be refreshed. Executed, approved, rejected,
 *    ignored, locked or in-flight rows are never rewritten.
 *  - The refresh is a guarded updateMany, so a state transition that happens
 *    between the lookup and the write is never overwritten.
 *  - Concurrent creation is resolved by the database unique constraint on
 *    (amazonAccountId, idempotencyKey). The loser of the race re-reads the
 *    winning row and applies the same guarded refresh path.
 *
 * This module intentionally has no Prisma import so it can be tested with an
 * in-memory store. The service passes the real Prisma delegate.
 */

export type ExistingRecommendation = {
  id: string;
  productId: string | null;
  status: string;
  executionState: string;
  approvalStatus: string;
};

export type RecommendationStore = {
  findFirst(args: Record<string, unknown>): Promise<ExistingRecommendation | null>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  create(args: Record<string, unknown>): Promise<{ id: string }>;
};

export type PersistSearchTermRecommendationInput = {
  amazonAccountId: string;
  productId: string;
  searchTermId: string;
  idempotencyKey: string;
  /** Fields applied when refreshing a still-pending recommendation. */
  refreshData: Record<string, unknown>;
  /** Full row used when creating. Must contain idempotencyKey. */
  createData: Record<string, unknown>;
};

export type PersistOutcome =
  | { outcome: "CREATED"; recommendationId: string }
  | { outcome: "REFRESHED"; recommendationId: string }
  | { outcome: "SKIPPED_NON_PENDING"; recommendationId: string }
  | { outcome: "SKIPPED_STATE_CHANGED"; recommendationId: string };

const EXISTING_SELECT = {
  id: true,
  productId: true,
  status: true,
  executionState: true,
  approvalStatus: true,
} as const;

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function handleExisting(
  store: RecommendationStore,
  existing: ExistingRecommendation,
  input: PersistSearchTermRecommendationInput
): Promise<PersistOutcome> {
  if (existing.productId && existing.productId !== input.productId) {
    throw new Error(
      `Recommendation ${existing.id} has conflicting product ownership.`
    );
  }

  // Never rewrite executed, rejected, ignored, approved, or otherwise
  // non-pending recommendations.
  if (
    existing.status !== "PENDING" ||
    existing.executionState !== "PENDING" ||
    existing.approvalStatus !== "PENDING"
  ) {
    return {
      outcome: "SKIPPED_NON_PENDING",
      recommendationId: existing.id,
    };
  }

  // Re-check the state atomically in the write itself. This prevents
  // overwriting a recommendation that changed state after the lookup.
  const updated = await store.updateMany({
    where: {
      id: existing.id,
      status: "PENDING",
      executionState: "PENDING",
      approvalStatus: "PENDING",
    },
    data: input.refreshData,
  });

  if (updated.count !== 1) {
    return {
      outcome: "SKIPPED_STATE_CHANGED",
      recommendationId: existing.id,
    };
  }

  return { outcome: "REFRESHED", recommendationId: existing.id };
}

export async function persistSearchTermRecommendation(
  store: RecommendationStore,
  input: PersistSearchTermRecommendationInput
): Promise<PersistOutcome> {
  const lookup = {
    where: {
      idempotencyKey: input.idempotencyKey,
      amazonAccountId: input.amazonAccountId,
      searchTermId: input.searchTermId,
    },
    select: EXISTING_SELECT,
  };

  const existing = await store.findFirst(lookup);

  if (existing) {
    return handleExisting(store, existing, input);
  }

  try {
    const created = await store.create({
      data: input.createData,
      select: { id: true },
    });

    return { outcome: "CREATED", recommendationId: created.id };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    // Another worker created the same recommendation between our lookup
    // and our insert. Re-read the winner and treat it as existing.
    const winner = await store.findFirst(lookup);

    if (!winner) {
      throw error;
    }

    return handleExisting(store, winner, input);
  }
}
