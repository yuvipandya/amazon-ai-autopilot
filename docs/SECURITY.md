# Security and safety

[Back to README](../README.md)

This project can ultimately issue advertising changes through a remote connector. Treat credentials, tenant isolation, approval policy, and execution state as production-critical.

## Server-side execution boundary

All write operations must pass through deterministic recommendation validation and the central server-side authorization boundary. Model-generated risk and confidence are informational; they do not authorize execution.

The authorization code checks account existence, organization ownership, account status, the automation pause switch, supported action types, bid/budget limits, and approval-source/automation-level policy.

## Change limits and kill switch

- Bid changes have an absolute 15% ceiling. An account's configured `maxBidChange` may impose a stricter limit.
- Budget changes are bounded by the account's configured `maxBudgetChange`.
- `automationPaused` is an authoritative account-level kill switch. It blocks execution and rollback writes.
- The account must be active.
- Entity ownership is checked before a write is authorized.

Do not weaken or bypass these checks to make a test or demo pass. Add tests whenever a safety rule changes.

## Approval model

The current engine distinguishes:

- `HUMAN_APPROVAL`: execution requires the recommendation to be in `APPROVED` state.
- `AUTOPILOT_POLICY`: execution requires the recommendation to remain `PENDING` and the account's automation policy to allow it.

Recommendation status, approval status, and execution state are distinct fields. Do not collapse them into a single boolean.

## Connector mode and live accounts

The connector factory can return `DEMO` or `REAL`. A live account must not silently fall back to the mock connector for execution or rollback. Before enabling a live account, verify its account-level LWA credentials, advertising profile ID, region, and API access.

Mock connector tests are not live API certification. Use a dedicated test account, start with reads, keep automation paused, and require human approval while validating live writes.

## Secrets and credential handling

Required application environment variables currently include:

- `DATABASE_URL`
- `AUTH_ADMIN_EMAIL`
- `AUTH_ADMIN_PASSWORD`
- `AUTOPILOT_ORGANIZATION_ID`

Feature-specific variables include `GEMINI_API_KEY` and `CRON_SECRET`.

Amazon LWA values are represented as fields on `AmazonAccount` (`lwaClientId`, `lwaClientSecret`, `lwaRefreshToken`, with `profileId` and `region`). The current code/schema inspection does not establish application-layer encryption for these database fields. Treat this as a security gap to address before production: use managed secrets or application-level encryption with key rotation, restrict database access, and ensure logs never expose tokens.

Never commit `.env`, API keys, refresh tokens, passwords, database URLs, or real seller data. Rotate any credential that has been committed or exposed.

## Authentication limitations to address before production

The current authentication implementation uses a single configured email/password pair from environment variables and a credentials provider. The inspected code compares the submitted password directly with `AUTH_ADMIN_PASSWORD`; it does not show a user table, per-user password hashing, multi-user identity lifecycle, MFA, or a rate-limiting mechanism.

This may be adequate for a controlled development/demo environment, but it should not be treated as production-grade multi-tenant authentication without additional controls. Before exposing the app publicly, implement appropriate identity management, hashed password storage (if credentials remain), MFA, rate limiting, session/cookie hardening, and operational account recovery.

## Cron endpoint

The autopilot cron route requires an exact bearer token match against `CRON_SECRET` and scopes work to `AUTOPILOT_ORGANIZATION_ID`. Use a long random secret, store it only in the scheduler and deployment secret stores, rotate it periodically, and never put it in a URL or logs.

## Auditability and rollback

Execution records include connector mode, request identifiers, state transitions, and audit information. Rollback checks whether the target value has drifted since the original execution and stops when it has. Preserve audit records; do not manually edit execution history to force rollback eligibility.

## Production security checklist

- [ ] Use HTTPS and secure deployment secrets.
- [ ] Restrict database network access and privileges.
- [ ] Encrypt sensitive Amazon credentials at rest at the application layer or use an approved secrets design.
- [ ] Replace the single shared admin credential pattern with a production identity system.
- [ ] Add MFA and login rate limiting.
- [ ] Verify tenant/organization isolation for every new route.
- [ ] Keep the kill switch and human approval enabled during live validation.
- [ ] Verify real connector behavior with a dedicated account and profile.
- [ ] Monitor failed and unknown execution states.
- [ ] Back up the database and test restore/rollback procedures.
