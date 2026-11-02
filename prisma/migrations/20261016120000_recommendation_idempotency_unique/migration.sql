-- Recommendation idempotency: one recommendation per (account, idempotencyKey).
--
-- ADDITIVE ONLY. No rows are modified or deleted.
--
-- PRE-FLIGHT (run read-only BEFORE deploying; must return zero rows):
--   SELECT "amazonAccountId", "idempotencyKey", COUNT(*) AS n
--   FROM "Recommendation"
--   WHERE "idempotencyKey" IS NOT NULL
--   GROUP BY "amazonAccountId", "idempotencyKey"
--   HAVING COUNT(*) > 1;
--
-- If any rows are returned, this index creation will fail. Resolve the
-- duplicates manually (keep the row with execution history) before deploying.
-- PostgreSQL treats NULL keys as distinct, so rows without a key are unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS "Recommendation_amazonAccountId_idempotencyKey_key"
ON "Recommendation"("amazonAccountId", "idempotencyKey");
