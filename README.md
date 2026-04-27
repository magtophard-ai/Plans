# Планы? / FEST MVP

Expo + Spring Boot + PostgreSQL MVP of the "Планы?" / FEST app.

Spring Boot in `backend-spring/` is the current canonical backend for the project. The old Fastify implementation remains in `backend/` as an archived legacy implementation for history and rollback reference only; new backend changes should target Spring.

## Quick links

- [`docs/CURRENT_STATUS.md`](./docs/CURRENT_STATUS.md) — **single source of truth** for what is shipped and how the stack is wired today.
- [`docs/HANDOFF.md`](./docs/HANDOFF.md) — forward-looking handoff: roadmap, open PRs/branches, gotchas, "how to resume".
- [`docs/DEMO_SETUP.md`](./docs/DEMO_SETUP.md) — runbook for standing the Spring demo stack up on a phone via Expo Go.
- [`docs/SPRING_SWITCHOVER.md`](./docs/SPRING_SWITCHOVER.md) — Spring canonical backend runbook, smoke checks, and archived Fastify rollback note.
- [`docs/SPRING_MIGRATION_STATUS.md`](./docs/SPRING_MIGRATION_STATUS.md) — migration/archive note for the Spring handoff.
- [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) — Windows/PowerShell runbook.
- [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — CI gate (Spring backend smoke jobs, frontend typecheck, and legacy Fastify archive checks).

## Repo layout

- `fest-app/` — frontend (Expo React Native, web + mobile)
- `backend-spring/` — canonical Spring Boot + PostgreSQL API
- `backend/` — archived legacy Fastify + PostgreSQL API implementation; not used for active backend development
- `contracts/` — OpenAPI + DB schema + acceptance docs
- `docs/` — status, handoff, runbooks, testing artifacts

## Quick start — Linux / macOS (bash / zsh)

```bash
# Postgres (docker)
docker run -d --name fest-pg \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=plans \
  postgres:17

# Canonical Spring backend
cd backend-spring
PORT=3001 ./gradlew bootRun   # listens on :3001, runs Flyway automatically
```

For local UI data, load the dev seed in a second terminal after Spring applies migrations:

```bash
psql postgres://postgres:postgres@localhost:5432/plans \
  -f backend-spring/src/main/resources/db/seed/R__dev_seed.sql
```

Then start the frontend:

```bash
cd fest-app
npm install --legacy-peer-deps
export EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api
export EXPO_PUBLIC_WS_BASE_URL=ws://localhost:3001/api/ws # optional; derived automatically when unset
npx expo start --web
```

Auth: any seeded phone (e.g. `+79990000000`) + OTP code `1111`.

For phone testing via Expo Go tunnel, follow [`docs/DEMO_SETUP.md`](./docs/DEMO_SETUP.md). The backend must be publicly reachable (cloudflared or equivalent), and these env vars must be exported **before** Metro starts:

```bash
export EXPO_PUBLIC_API_BASE_URL=https://<backend-host>/api
export EXPO_PUBLIC_WS_BASE_URL=wss://<backend-host>/api/ws
```

## Quick start — Windows (PowerShell)

On the canonical Windows dev box disk `C:` is full (see [`AGENTS.md`](./AGENTS.md)), so npm commands should redirect cache to a volume that has space. Paths below are relative to wherever you cloned the repo.

```powershell
# Canonical Spring backend
cd .\backend-spring
$env:PORT="3001"
.\gradlew.bat bootRun

# Frontend
cd ..\fest-app
$env:npm_config_cache="E:\npm-cache"; npm install --legacy-peer-deps
$env:EXPO_PUBLIC_API_BASE_URL="http://localhost:3001/api"
$env:EXPO_PUBLIC_WS_BASE_URL="ws://localhost:3001/api/ws"
npx expo start --web
```

Windows uses a native PostgreSQL service (`postgresql-x64-17`) instead of docker — see `AGENTS.md` for `psql` and connection details.

## Quality gate (local)

Canonical Spring backend:

- Spring test: `cd backend-spring && ./gradlew test`
- Spring core smoke: `cd backend-spring && ./gradlew coreSmokeTest`
- Spring realtime smoke: `cd backend-spring && ./gradlew realtimeSmokeTest`
- Spring content ops smoke: `cd backend-spring && ./gradlew contentOpsSmokeTest`
- Spring full network smoke: `cd backend-spring && ./gradlew fullSpringSmokeTest`

Frontend:

- Frontend typecheck: `cd fest-app && npx tsc --noEmit`
- Optional animation sandbox: `cd fest-app && npx tsc --noEmit -p tsconfig.fest-animations.json`

Archived legacy Fastify checks remain available for rollback/history only:

- Legacy typecheck: `cd backend && npx tsc --noEmit`
- Legacy REST smoke: `cd backend && npx tsx src/tests/e2e-smoke.ts` (needs legacy backend running)
- Legacy realtime smoke: `cd backend && npx tsx src/tests/rt2-smoke.ts` (needs legacy backend running)
- Legacy content ops smoke: `cd backend && npx tsx src/tests/content-ops-smoke.ts` (needs legacy backend running)

`fest-app/src/fest-animations/**` is intentionally excluded from the main frontend TypeScript gate.

## Content Ops v1

Internal real-event supply is CLI-only. Use Spring for active content-ops work:

```bash
cd backend-spring
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="import --file ../docs/examples/content-ops-event.example.json"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="list --state imported"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="publish --ingestion-id <id> [--venue-id <id>]"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="sync --file ../docs/examples/content-ops-event.example.json"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="cancel --event-id <id> --reason '...'"
```

The legacy Fastify content-ops commands remain documented in `backend/README.md` only for archive/rollback reference. `ops:sync` updates only already-published/linked events; new public events require explicit `ops:publish`. Venue auto-create is a v1 compromise: exact name+address is reused, otherwise a venue is created with `lat=0/lng=0`; pass `--venue-id` when coordinates matter.

See [`docs/HANDOFF.md`](./docs/HANDOFF.md#content-ops-commands) and [`docs/examples/content-ops-event.example.json`](./docs/examples/content-ops-event.example.json).

## Migration / archive note

Fastify is no longer the active backend because the Spring Boot implementation reached functional parity, passed Spring smoke coverage, and completed mobile-facing validation in PR #16. The Fastify code remains at `backend/` as an archived legacy implementation for rollback/history; do not add new backend functionality there unless explicitly restoring or auditing legacy behavior. New backend code, tests, runbooks, and content-ops work belong in `backend-spring/`.

## CI

Every PR and every push to `master` runs CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)):

- `backend-spring test`
- `backend-spring core smoke`
- `backend-spring realtime smoke`
- `backend-spring content ops smoke`
- `backend-spring full smoke`
- `frontend typecheck`
- `legacy Fastify typecheck`
- `legacy Fastify e2e smoke`
- `legacy Fastify realtime smoke`
- `legacy Fastify content ops smoke`

All jobs must be green to merge. The Fastify jobs are retained as legacy archive/rollback checks, not as the active backend path.

## Phone testing via Expo Go

See [`docs/DEMO_SETUP.md`](./docs/DEMO_SETUP.md) for the full recipe. The short version: expose Spring on a public backend URL and export `EXPO_PUBLIC_API_BASE_URL` + `EXPO_PUBLIC_WS_BASE_URL` in the same shell **before** `npx expo start --tunnel --go` so they end up baked into the JS bundle Expo Go downloads.
