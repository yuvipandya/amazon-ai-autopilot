# Development guide

[Back to README](../README.md)

## Prerequisites

- Node.js 20.9+ (use a current supported LTS release).
- npm.
- PostgreSQL.
- Git.

Use the exact dependency versions in `package-lock.json`; install with `npm ci`.

## Local setup

```bash
git clone https://github.com/yuvipandya/amazon-ai-autopilot.git
cd amazon-ai-autopilot
npm ci
```

Create a root-level `.env` file:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
AUTH_ADMIN_EMAIL="admin@example.com"
AUTH_ADMIN_PASSWORD="use-a-unique-local-password"
AUTOPILOT_ORGANIZATION_ID="your-organization-id"
GEMINI_API_KEY=""
CRON_SECRET="long-random-value"
```

The first four values are required for the current app startup/authentication and database access. Gemini and cron configuration are needed only for those features. Keep secrets out of source control.

## Database workflow

```bash
npx prisma migrate deploy
npx prisma generate
```

The project uses Prisma's schema at `prisma/schema.prisma` and migrations under `prisma/migrations`. Prisma config files load environment variables using `dotenv/config` and use `DATABASE_URL`.

For local seed data:

```bash
npm run seed
```

Review `prisma/seed.ts` before running it against any shared or production database.

When changing the schema, create and review a migration as part of the change. Do not use an unreviewed schema push as a production migration strategy. Check the generated SQL, indexes, constraints, and data implications before applying.

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Generate Prisma Client, build Next.js, prepare standalone output |
| `npm run start` | Start the prepared standalone output |
| `npm run seed` | Run Prisma seed script |
| `npm test` | Run safety, Gemini, and enterprise suites |
| `npm run test:amazon-connector` | Run Amazon connector tests |
| `npm run test:idempotency` | Run recommendation idempotency tests |
| `npm run test:amazon-reporting` | Run Amazon reporting tests |

Additional test commands are documented in [Testing](TESTING.md).

## Project layout

```text
.
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
├── scripts/
│   ├── test-safety.ts
│   ├── test-enterprise-suite.ts
│   ├── test-amazon-connector-v3.ts
│   └── test-search-term-idempotency.ts
├── src/
│   ├── app/
│   │   ├── api/
│   │   └── ...
│   └── lib/
│       ├── ai/
│       ├── amazon/
│       ├── auth/
│       ├── engines/
│       └── services/
├── docs/
└── package.json
```

## Working with AI reasoning

The Gemini integration is optional. When `GEMINI_API_KEY` is absent, the code uses deterministic fallback behavior for supported recommendation generation. Gemini output is schema-checked and is not the authorization mechanism. Keep business rules, validation, account ownership, and write permissions in deterministic server-side code.

## Working with Amazon connectors

The connector factory selects DEMO or REAL mode based on the account's live flag and configured account credentials/profile. For development, use DEMO mode. For live integration work:

1. Use a dedicated test account/profile where possible.
2. Confirm region and advertising profile details.
3. Verify read operations before testing writes.
4. Keep the automation pause switch enabled until all checks pass.
5. Use human approval while validating.
6. Confirm post-write read-back and audit records.
7. Never treat a mocked connector test as proof of live API behavior.

See [Architecture](ARCHITECTURE.md) and [Security](SECURITY.md).

## Contribution workflow

Before opening a pull request:

1. Keep the change scoped and explain the behavior it changes.
2. Add or update deterministic tests for safety-sensitive logic.
3. Run lint, relevant targeted suites, and the production build.
4. Review migrations and generated artifacts.
5. Confirm no credentials, local databases, logs, or environment files are staged.
6. Update the relevant documentation when routes, environment variables, or safety behavior changes.
