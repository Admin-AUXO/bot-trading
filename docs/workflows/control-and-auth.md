# Control And Auth

The dashboard has two auth layers. Mix them up and you either break controls or create a hole.

## Secret Sources

Dashboard control secret resolution lives in `dashboard/lib/server/operator-session.ts`.

Resolution order:

1. `DASHBOARD_OPERATOR_SECRET`
2. `CONTROL_API_SECRET`
3. `CONTROL_SECRET`
4. `API_CONTROL_SECRET`
5. `DASHBOARD_CONTROL_SECRET`

## Operator Session Flow

1. Browser posts the secret to `dashboard/app/api/operator-session/route.ts`
2. The server validates it and sets an HTTP-only cookie
3. Mutating dashboard proxy requests require that cookie
4. The proxy injects bearer auth toward the backend

The browser never needs the backend bearer token directly.

## Proxy Rules

Proxy file: `dashboard/app/api/[...path]/route.ts`

- non-GET requests require operator session
- non-GET requests receive bearer auth upstream
- `GET /api/stream` also receives bearer auth upstream
- ordinary read routes do not require operator session

The operator-session cookie is a dashboard boundary, not a backend boundary.

## Backend Rules

- mutating backend routes require `requireBearerToken`
- control-plane writes include pause, resume, reset-daily, manual entry, manual exit, profile create/toggle/delete, and wallet reconcile
- read routes can stay public, but keep that choice explicit

## Failure Modes

- no configured secret -> dashboard returns `503` for privileged paths
- missing operator session -> dashboard returns `401` for mutating proxy requests
- backend unavailable -> dashboard proxy returns `503` or `504`

## Files To Update Together

- `dashboard/app/api/[...path]/route.ts`
- `dashboard/app/api/operator-session/route.ts`
- `dashboard/lib/server/operator-session.ts`
- `backend/src/api/middleware/auth.ts`
- `backend/src/api/routes/control.ts`
- `backend/src/api/routes/profiles.ts`
- `backend/src/api/routes/positions.ts`
