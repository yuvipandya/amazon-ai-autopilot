# Deployment guide

[Back to README](../README.md)

## Deployment status

The repository is configured for a Next.js standalone build (`output: "standalone"`). The build script runs Prisma Client generation, `next build`, and `scripts/prepare-standalone.mjs`. This configuration does not by itself select a hosting provider or create a production deployment.

A successful local build is not proof that production environment variables, database connectivity, cron scheduling, Amazon credentials, or live writes are ready.

## Required production configuration

Configure these values in the hosting provider's secret/environment settings:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Production PostgreSQL connection string |
| `AUTH_ADMIN_EMAIL` | Current credentials-provider admin email |
| `AUTH_ADMIN_PASSWORD` | Current credentials-provider admin password |
| `AUTOPILOT_ORGANIZATION_ID` | Organization scope for authentication and scheduled processing |
| `CRON_SECRET` | Bearer secret for the scheduled autopilot endpoint |
| `GEMINI_API_KEY` | Optional Gemini reasoning integration |

Configure Amazon LWA credentials, profile ID, and region on the intended Amazon account record using the application's supported account setup path. Protect these values as secrets. Do not copy development credentials into production.

## Build and start

```bash
npm ci
npm run build
npm run start
```

The `start` script runs `scripts/start-production.mjs`; the build script prepares the standalone output. Use the Node version supported by the installed Next.js version and keep the lockfile-based install reproducible.

## Database migration preflight

Before applying migrations to a production database:

1. Take a verified backup and confirm restore procedures.
2. Confirm the target database and environment.
3. Inspect the migration SQL in the exact release being deployed.
4. Run the duplicate preflight below for the recommendation idempotency index.
5. Resolve any duplicates with a documented, history-preserving data decision.
6. Apply migrations during a controlled rollout window.
7. Verify application health and critical read paths afterward.

The idempotency migration adds a unique index over `Recommendation(amazonAccountId, idempotencyKey)`. Check for duplicate non-null pairs first:

```sql
SELECT
  "amazonAccountId",
  "idempotencyKey",
  COUNT(*) AS duplicate_count
FROM "Recommendation"
WHERE "idempotencyKey" IS NOT NULL
GROUP BY "amazonAccountId", "idempotencyKey"
HAVING COUNT(*) > 1;
```

If this query returns rows, do not blindly delete records. Review each group and preserve the recommendation with the authoritative execution/approval/audit history. Resolve the duplicates deliberately, then re-run the query and confirm it returns no rows.

Apply migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

Do not apply a migration to production until the preflight and backup are complete.

## Scheduled autopilot

Configure the hosting scheduler to send a POST request to:

```text
/api/cron/autopilot
```

with header:

```text
Authorization: Bearer <CRON_SECRET>
```

The route processes active accounts for `AUTOPILOT_ORGANIZATION_ID`, retries due jobs, and avoids starting a fresh cycle for an account with unresolved retries. Choose a cadence appropriate for your account volume and hosting execution limits. The route currently declares a maximum duration of 60 seconds; verify that your host supports the required runtime and timeout.

Do not enable unattended live execution until the scheduler, retry behavior, alerts, kill switch, and live connector have been tested.

## Live Amazon Ads rollout

Recommended staged rollout:

1. Deploy with accounts in DEMO mode.
2. Verify health, authentication, database, dashboards, and sync workflows.
3. Configure a dedicated Amazon test account and advertising profile.
4. Validate real connector authentication and read operations.
5. Validate profile and marketplace/region selection.
6. Keep automation paused and use human approval for the first controlled write.
7. Confirm Amazon's read-back value, request metadata, and audit record.
8. Test rollback against a controlled change and verify drift protection.
9. Only then consider enabling limited policy-based automation with conservative account limits.

## Post-deployment checklist

- [ ] Build and start complete on the target runtime.
- [ ] Production database backup exists and migrations are applied.
- [ ] Health endpoint responds as expected.
- [ ] Authentication works and is not using development credentials.
- [ ] Organization ID is correct and tenant boundaries are tested.
- [ ] Cron secret is configured and unauthorized calls are rejected.
- [ ] Scheduler is configured and monitored.
- [ ] Gemini behavior is verified or deterministic fallback is accepted.
- [ ] Amazon connector is explicitly in the intended mode.
- [ ] Live credentials and profile have been validated without logging secrets.
- [ ] Kill switch and human approval behavior are tested.
- [ ] Execution verification, audit logging, and rollback are tested.
- [ ] Alerts exist for failed/unknown execution and job retry exhaustion.

## Rollback plan

For application rollback, redeploy the previous known-good application artifact. Database migrations may not be automatically reversible; review migration compatibility before deploying and restore from backup only under an approved recovery plan. Do not assume rolling back application code also rolls back database schema or remote Amazon Ads changes.
