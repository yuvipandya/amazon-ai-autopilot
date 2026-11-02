# Testing guide

[Back to README](../README.md)

## Test commands

| Command | Script | What it targets |
|---|---|---|
| `npm test` | Composite | Runs safety, Gemini, and enterprise suites sequentially |
| `npm run test:safety` | `scripts/test-safety.ts` | Deterministic safety checks, including rejection of bid changes beyond the configured hard ceiling |
| `npm run test:gemini` | `scripts/test-gemini.ts` | Gemini reasoning and fallback behavior |
| `npm run test:enterprise` | `scripts/test-enterprise-suite.ts` | Broad authorization, execution, rollback, audit, scheduler, retry, and business-rule suite |
| `npm run test:amazon-reporting` | `scripts/test-amazon-reporting.ts` | Amazon reporting behavior |
| `npm run test:amazon-connector` | `scripts/test-amazon-connector-v3.ts` | Connector request/response handling |
| `npm run test:idempotency` | `scripts/test-search-term-idempotency.ts` | Search-term recommendation persistence and concurrency behavior |

The `npm test` script does **not** include the connector and idempotency scripts. Run those explicitly when validating changes in those areas.

## Recommended local validation

For a broad pre-merge check:

```bash
npm run lint
npm test
npm run test:amazon-reporting
npm run test:amazon-connector
npm run test:idempotency
npm run build
```

If a change is isolated, run its targeted suite first, then the broader suites.

## Coverage themes

The current test scripts cover themes including:

- Hard bid-change limits and deterministic rejection.
- Organization/account authorization boundaries.
- Kill-switch enforcement.
- Separation of human approval and autopilot-policy execution.
- Recommendation execution states and atomic claims.
- Connector request headers, profile scoping, pagination, response-shape handling, and failure behavior.
- Post-write verification and rollback/recovery paths.
- Search-term recommendation idempotency, concurrent creation, and guarded refreshes.
- Scheduler locking, retry behavior, ingestion, and AI fallback paths.

Read the test source for the exact assertions and fixtures. Test names and passing counts can change as the suite evolves.

## Interpreting results

- A passing mock/offline connector test validates the tested adapter behavior; it does not prove that live Amazon Ads credentials, permissions, profile configuration, or network access are correct.
- A passing build validates compilation and the configured build pipeline; it does not validate production secrets, database reachability, cron delivery, or deployment.
- A Gemini test may use mocks or deterministic fallback. Confirm its test setup before interpreting it as a live model integration test.
- A rollback test validates only the scenarios represented in its fixtures. Production rollback still depends on audit data, connector availability, account state, and remote value drift.

## Results recorded during the current project validation

The developer reported the following results from a local run:

- Amazon connector suite: 7/7 passed.
- Idempotency suite: 6/6 passed.
- Enterprise suite: 36/36 passed.
- Safety suite: passed, including rejection of a bid adjustment above the 15% ceiling.
- ESLint: no errors.
- Production build: Prisma Client generated, Next.js compilation and TypeScript checks passed, 16 static pages generated, and standalone preparation completed.

These are point-in-time results supplied during development, not a guarantee that every future commit will produce the same counts.
