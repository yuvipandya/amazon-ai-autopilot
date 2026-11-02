# Amazon AI Autopilot

<p align="center">
  <strong>Guarded Amazon Ads optimization with approval workflows, deterministic execution controls, and rollback-aware operations.</strong>
</p>

<p align="center">
  <a href="https://github.com/yuvipandya/amazon-ai-autopilot"><img alt="Repository" src="https://img.shields.io/badge/repository-GitHub-181717?logo=github"></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-database-4169E1?logo=postgresql">
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma">
</p>

Amazon AI Autopilot is a full-stack application for analyzing Amazon advertising performance and managing optimization recommendations. Its central design principle is that **AI can assist with analysis and explanation, but deterministic server-side rules control whether an action may execute**.

> **Important:** This repository contains both DEMO and REAL connector paths. A successful local build or test run does not mean a live Amazon Ads account is connected, that production credentials are configured, or that the application is deployed. Start in DEMO mode and verify every production prerequisite before enabling live writes.

## Contents

- [What it does](#what-it-does)
- [Safety model](#safety-model)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Getting started](#getting-started)
- [Environment configuration](#environment-configuration)
- [Database and migrations](#database-and-migrations)
- [Run and build](#run-and-build)
- [Tests](#tests)
- [API overview](#api-overview)
- [Documentation](#documentation)
- [Operational notes](#operational-notes)

## What it does

- Organizes Amazon seller accounts, products, campaigns, keywords, search terms, recommendations, and execution history.
- Ingests account performance data through an Amazon connector abstraction.
- Classifies search-term performance using deterministic rules.
- Uses Google Gemini as a recommendation-reasoning layer when configured, with deterministic fallback behavior.
- Supports recommendation review actions such as approve, reject, execute, ignore, lock, and rollback.
- Separates human approval from policy-authorized autopilot execution.
- Tracks execution state, request identifiers, before/after snapshots, verification, and audit events.
- Includes scheduled autopilot-cycle processing with job locks and retry handling.

The feature set and implementation details are described in the [architecture guide](docs/ARCHITECTURE.md).

## Safety model

The execution path is deliberately stricter than the recommendation-generation path:

1. A recommendation is created from account and advertising performance data.
2. Deterministic validation checks the recommendation.
3. A server-side authorization boundary checks account ownership, account status, the automation pause switch, supported action types, configured change limits, and approval policy.
4. The execution engine atomically claims an eligible recommendation.
5. The selected connector performs the write.
6. The engine reads back the changed value and verifies the result.
7. Execution and audit state are persisted.

Key controls implemented in the code include:

- A hard maximum bid adjustment ceiling of 15%; an account-level limit can make it stricter.
- An account-level automation pause / kill switch that blocks writes.
- Organization ownership checks around account, product, and recommendation access.
- Separate eligibility rules for human-approved and autopilot-policy execution.
- Live accounts are not allowed to silently execute through the mock connector.
- Search-term recommendation persistence uses a database uniqueness constraint and guarded updates to avoid duplicate creation or overwriting a recommendation that is no longer pending.
- Rollback checks the original successful execution, account ownership and status, kill switch, and current-value drift before attempting restoration.

Read [Security and safety](docs/SECURITY.md) before configuring any live account.

## Architecture

```mermaid
flowchart TD
    UI[Next.js application] --> API[App Router API routes]
    API --> AUTH[Session and organization authorization]
    API --> SERVICES[Application services]
    SERVICES --> DB[(PostgreSQL via Prisma)]
    SERVICES --> AI[Gemini reasoning layer]
    SERVICES --> SCHED[Scheduler and ingestion]
    SCHED --> CONNECTOR[Amazon connector factory]
    API --> EXEC[Validation and execution engine]
    EXEC --> POLICY[Server-side authorization and safety policy]
    POLICY --> CONNECTOR
    CONNECTOR --> DEMO[Mock connector]
    CONNECTOR --> REAL[Amazon Ads connector]
    EXEC --> VERIFY[Read-after-write verification]
    VERIFY --> AUDIT[Execution state and audit history]
    AUDIT --> DB
```

The autopilot cycle is implemented as:

```text
SYNC -> ANALYZE -> RECOMMEND -> AUTHORIZE -> EXECUTE -> VERIFY -> MEASURE
```

This is a logical overview, not a deployment topology. See [Architecture](docs/ARCHITECTURE.md).

## Technology stack

| Area | Technology |
|---|---|
| Web application | Next.js 16, React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL |
| ORM / migrations | Prisma 7 |
| Authentication | NextAuth 5 beta, credentials provider |
| AI reasoning | Google GenAI SDK |
| Charts | Recharts |
| Runtime / scripts | Node.js, TSX |
| Linting | ESLint 9 |

Versions are defined in `package.json`; use the lockfile for reproducible installs.

## Getting started

### Prerequisites

- Node.js compatible with the Next.js version in `package.json` (Node.js 20.9 or newer is required by Next.js 16).
- npm.
- A PostgreSQL database.
- Git.

### 1. Clone and install

```bash
git clone https://github.com/yuvipandya/amazon-ai-autopilot.git
cd amazon-ai-autopilot
npm ci
```

### 2. Configure environment

Create a local `.env` file in the project root. At minimum, configure the database and credentials-provider authentication variables:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"

AUTH_ADMIN_EMAIL="admin@example.com"
AUTH_ADMIN_PASSWORD="replace-with-a-long-unique-password"
AUTOPILOT_ORGANIZATION_ID="your-organization-id"

# Optional: Gemini-powered recommendation reasoning.
GEMINI_API_KEY=""

# Required to authorize the scheduled autopilot endpoint.
CRON_SECRET="replace-with-a-long-random-secret"
```

Do not commit `.env`, credentials, refresh tokens, or production secrets. The application currently uses a configured credentials-provider admin identity; review the authentication limitations in [Security and safety](docs/SECURITY.md).

Amazon Ads credentials and profile configuration are associated with an account record in the current schema. They are not supplied by the example environment file. See [Development](docs/DEVELOPMENT.md) and [Deployment](docs/DEPLOYMENT.md) before connecting a live account.

### 3. Prepare the database

After configuring `DATABASE_URL`, apply the committed migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

For local demo data, inspect the seed script and run:

```bash
npm run seed
```

Only seed a database that you intend to use for development or demonstration.

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment configuration

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL connection used by Prisma |
| `AUTH_ADMIN_EMAIL` | Yes | Configured credentials-provider admin email |
| `AUTH_ADMIN_PASSWORD` | Yes | Configured credentials-provider admin password |
| `AUTOPILOT_ORGANIZATION_ID` | Yes | Organization identity used by authentication and cron scoping |
| `CRON_SECRET` | For cron endpoint | Bearer secret checked by the autopilot cron route |
| `GEMINI_API_KEY` | Optional | Enables Gemini reasoning; deterministic fallback is used when absent or when the call fails |

Live Amazon Ads credentials are stored on the Amazon account record in the current Prisma schema (`lwaClientId`, `lwaClientSecret`, `lwaRefreshToken`, `profileId`, and `region`). Treat these values as highly sensitive. See [Security](docs/SECURITY.md).

## Database and migrations

The Prisma schema is in `prisma/schema.prisma`; migrations are in `prisma/migrations`. The schema models organizations, Amazon accounts, products, campaigns, keywords, search terms, performance metrics, recommendations, jobs, experiments, learning outcomes, and audit records.

**Migration caution:** the recommendation idempotency migration adds a unique index on `(amazonAccountId, idempotencyKey)`. Before applying it to an existing production database, check for duplicate non-null key pairs and resolve them deliberately. Do not delete records with execution or audit history merely to make the migration pass.

See [Deployment](docs/DEPLOYMENT.md) for a preflight query and rollout guidance.

## Run and build

```bash
npm run dev       # local development
npm run lint      # ESLint
npm run build     # Prisma Client generation, Next.js production build, standalone preparation
npm run start     # start the prepared standalone production output
```

The Next.js configuration uses `output: "standalone"`; the build script also runs `scripts/prepare-standalone.mjs`.

## Tests

```bash
npm test
npm run test:safety
npm run test:gemini
npm run test:enterprise
npm run test:amazon-reporting
npm run test:amazon-connector
npm run test:idempotency
```

The `npm test` script runs safety, Gemini, and enterprise suites. Connector and idempotency tests are separate scripts and should be run explicitly when validating those areas. See [Testing](docs/TESTING.md) for coverage notes and limitations.

## API overview

The application exposes route handlers under `src/app/api`, including account sync, dashboard data, bid analysis, search-term analysis, recommendation actions, health, and the scheduled autopilot endpoint. See the [API reference](docs/API.md) for the route inventory and request notes.

## Documentation

| Guide | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Services, data flow, recommendation lifecycle, scheduler, connectors |
| [API reference](docs/API.md) | API route inventory, methods, authentication expectations |
| [Development](docs/DEVELOPMENT.md) | Local setup, scripts, database workflow, project layout |
| [Testing](docs/TESTING.md) | Test commands, scope, and interpretation |
| [Security and safety](docs/SECURITY.md) | Authorization, approval gates, kill switch, credentials, known limitations |
| [Deployment](docs/DEPLOYMENT.md) | Production build, database migration preflight, cron, rollout checklist |

## Operational notes

- Build success verifies compilation and standalone preparation; it does not verify a live Amazon API connection or production deployment.
- Start with DEMO connector behavior. Do not set an account as live until its credentials, profile, region, permissions, and read/write behavior have been validated.
- Keep a human approval step enabled while validating recommendation quality and operational behavior.
- Monitor execution states including `SUBMITTED`, `AMAZON_ACCEPTED`, `VERIFIED_SUCCESS`, `FAILED`, and `UNKNOWN`; an accepted request is not equivalent to a verified state change.
- Never run migrations against production without a backup and the migration preflight described in the deployment guide.

---

Built with Next.js, TypeScript, Prisma, PostgreSQL, and guarded execution workflows.
