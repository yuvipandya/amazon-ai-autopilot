# API reference

[Back to README](../README.md)

All routes are implemented as Next.js App Router route handlers under `src/app/api`. Unless noted otherwise, application routes are intended for an authenticated session and organization-scoped data access. The exact response shapes should be treated as implementation details of the current source; inspect the route handler before building an external client against them.

## Route inventory

| Route | Method(s) | Purpose / notes |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handlers |
| `/api/health` | GET | Health endpoint |
| `/api/dashboard` | GET | Dashboard data |
| `/api/activity` | GET | Activity/audit feed |
| `/api/sync` | POST | Syncs an account; accepts optional `amazonAccountId` and `reportPeriod` |
| `/api/bids/analyze` | POST | Requires `productId`; analyzes keyword performance and creates bid recommendations |
| `/api/search-terms/analyze` | POST | Requires `productId`; classifies search terms and persists recommendations |
| `/api/recommendations` | GET | Recommendation collection |
| `/api/recommendations/[id]/action` | POST | Applies a recommendation action |
| `/api/cron/autopilot` | GET, POST | Runs the scheduled autopilot cycle; requires cron bearer secret |
| `/api/demo/retry` | POST | Demo/retry workflow |
| `/api/settings` | GET, POST | Settings read/update |
| `/api/auth/[...nextauth]` | GET, POST | Authentication callbacks |

The production build also contains these UI routes: `/`, `/login`, `/activity`, `/ai-changes`, `/products`, `/products/[asin]`, and `/settings`. UI routes are not API endpoints.

## Recommendation actions

Endpoint:

```http
POST /api/recommendations/{id}/action
Content-Type: application/json
```

Supported `action` values:

- `APPROVE`
- `REJECT`
- `EXECUTE`
- `IGNORE`
- `LOCK`
- `ROLLBACK`

Example approval request:

```json
{
  "action": "APPROVE"
}
```

Example execution request:

```json
{
  "action": "EXECUTE"
}
```

Human execution requires the recommendation to be approved first. Rollback uses the original successful execution's audit data and is subject to account, ownership, kill-switch, and drift checks. A successful approval response does not mean an Amazon write has occurred.

## Account synchronization

```http
POST /api/sync
Content-Type: application/json
```

Optional request fields:

```json
{
  "amazonAccountId": "account-id",
  "reportPeriod": "LAST_14_DAYS"
}
```

When no account ID is supplied, the handler selects an active account belonging to the authenticated organization. The default report period in the route is `LAST_14_DAYS`.

## Bid analysis

```http
POST /api/bids/analyze
Content-Type: application/json
```

Required body:

```json
{
  "productId": "product-id"
}
```

The handler checks product access, evaluates keyword performance and inventory context, and creates pending recommendations when its deterministic criteria are met. Gemini can contribute recommendation reasoning; fallback logic remains available.

## Search-term analysis

```http
POST /api/search-terms/analyze
Content-Type: application/json
```

Required body:

```json
{
  "productId": "product-id"
}
```

The handler refreshes deterministic classifications and persists search-term recommendations. Recommendation generation requires approval; the AI layer does not authorize execution.

## Scheduled autopilot

```http
POST /api/cron/autopilot
Authorization: Bearer <CRON_SECRET>
```

The route requires `CRON_SECRET` and `AUTOPILOT_ORGANIZATION_ID`. It processes active accounts for the configured organization, handles due retries, and skips starting a fresh cycle for accounts with unresolved retries. The handler also exposes GET by delegating it to the POST handler; configure your scheduler to use POST.

## Authentication and authorization

The application uses a credentials-provider session. Protected handlers call `requireAuth` and/or organization-scoped lookup helpers. Do not assume that possession of an internal database ID grants access. For exact route-specific behavior and error handling, consult the route source.

## Error handling

Handlers commonly return JSON with `success` and/or `error` fields and HTTP status codes. Relevant action outcomes include:

- `400`: invalid or missing request data / unsupported action.
- `401`: unauthenticated or invalid cron authorization.
- `404`: requested account, product, or recommendation not found in the caller's scope.
- `409`: recommendation decision conflict or state conflict.
- `422`: action rejected by execution or policy checks.
- `500`: unexpected server or dependency failure.

These are observed patterns, not a promise that every endpoint uses an identical error schema.
