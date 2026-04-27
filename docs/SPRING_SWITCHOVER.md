# Spring canonical backend runbook

Spring Boot in `backend-spring/` is the current canonical backend for Plans. The old Fastify implementation remains in `backend/` as an archived legacy implementation for history and rollback reference only; new backend changes should target Spring.

## Current backend status

### Spring canonical backend

- Location: `backend-spring/`.
- Run: `cd backend-spring && PORT=3001 ./gradlew bootRun`.
- API: `http://localhost:3001/api`.
- Realtime: raw JSON WebSocket at `ws://localhost:3001/api/ws`.
- Database: PostgreSQL 17. Flyway runs automatically from `backend-spring/src/main/resources/db/migration` against a fresh Spring-managed database.
- Seed: `backend-spring/src/main/resources/db/seed/R__dev_seed.sql`.
- Content ops: CLI-only through `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="..."`.
- CI: `backend-spring test`, `core smoke`, `realtime smoke`, `content ops smoke`, and `full smoke`.

### Fastify archived legacy implementation

- Location: `backend/`.
- Status: archived legacy code, not the active backend path.
- Purpose: history, rollback drills, and legacy parity audits only.
- CI legacy checks remain so the archive does not silently rot, but they do not make Fastify the active backend.

## Spring local run

### 1. PostgreSQL

Use a fresh local Postgres 17 database for Spring:

```bash
docker run -d --name fest-pg \
  -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=plans \
  postgres:17
```

If it already exists:

```bash
docker start fest-pg
```

The Spring Flyway flow is intended for a fresh Spring-managed DB. Do not point it at an existing production or legacy Fastify-managed DB without a separate Flyway baseline plan.

### 2. Spring backend

```bash
cd backend-spring
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/plans
export JWT_SECRET=dev-secret
export OTP_CODE=1111
export PORT=3001
./gradlew bootRun
```

Health:

```bash
curl http://localhost:3001/api/health
```

### 3. Seed data

Spring tests load the dev seed automatically. For a manual local app run, load the seed SQL into the fresh Spring DB:

```bash
psql postgres://postgres:postgres@localhost:5432/plans \
  -f backend-spring/src/main/resources/db/seed/R__dev_seed.sql
```

Seeded phones include:

- `+79990000000`
- `+79991111111`
- `+79992222222`
- `+79993333333`
- `+79994444444`
- `+79995555555`

Use OTP `1111`.

### 4. Frontend against Spring

```bash
cd fest-app
npm install --legacy-peer-deps
export EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api
export EXPO_PUBLIC_WS_BASE_URL=ws://localhost:3001/api/ws
npx expo start --web
```

`EXPO_PUBLIC_WS_BASE_URL` is optional locally: if unset, `fest-app/src/api/client.ts` derives `ws://localhost:3001/api/ws` from `EXPO_PUBLIC_API_BASE_URL`.

For Expo Go via tunnel:

```bash
export BACKEND_PUBLIC_URL=https://<slug>.trycloudflare.com
export EXPO_PUBLIC_API_BASE_URL="$BACKEND_PUBLIC_URL/api"
export EXPO_PUBLIC_WS_BASE_URL="wss://${BACKEND_PUBLIC_URL#https://}/api/ws"
npx expo start --tunnel --go
```

### 5. Content ops on Spring

Content ops remains CLI/internal only:

```bash
cd backend-spring
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="import --file ../docs/examples/content-ops-event.example.json"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="list --state imported"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="show --ingestion-id <id>"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="publish --ingestion-id <id> [--venue-id <venue-id>] [--force-link-event-id <event-id>]"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="update --ingestion-id <id>"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="sync --file ../docs/examples/content-ops-event.example.json"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="cancel --event-id <id> --reason '...'"
```

## Verification

Canonical Spring checks:

```bash
cd backend-spring
./gradlew test
./gradlew coreSmokeTest
./gradlew realtimeSmokeTest
./gradlew contentOpsSmokeTest
./gradlew fullSpringSmokeTest
```

`fullSpringSmokeTest` starts Spring on a random local port with PostgreSQL via Testcontainers, calls real HTTP on `localhost`, connects a real WebSocket client to `/api/ws`, and exercises health, OTP auth, events, plan CRUD/list/detail, share-token preview/join, participants invite/list, proposals, vote/unvote, finalize/unfinalize, messages with `client_message_id` dedup, realtime events, complete/repeat, notifications, and content ops service-path coverage.

Frontend contract check when env/docs/scripts touch frontend startup:

```bash
cd fest-app
npx tsc --noEmit
```

Archived legacy Fastify checks remain available for rollback/history only:

```bash
cd backend
npx tsc --noEmit
npx tsx src/tests/e2e-smoke.ts
npx tsx src/tests/rt2-smoke.ts
npx tsx src/tests/content-ops-smoke.ts
```

The legacy smoke scripts require Fastify already running on `:3001` with migrated and seeded Postgres.

## Archived Fastify rollback drill

1. Stop Spring.
2. Start the legacy Fastify backend:
   ```bash
   cd backend
   npm install --legacy-peer-deps
   cp .env.example .env
   npm run db:migrate
   npm run db:seed
   npm run start
   ```
3. Keep frontend env unchanged for a local rollback drill:
   ```bash
   export EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api
   export EXPO_PUBLIC_WS_BASE_URL=ws://localhost:3001/api/ws
   ```
4. For a public/mobile rollback drill, point `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_WS_BASE_URL` at the legacy Fastify tunnel instead of the Spring tunnel.

Fastify smoke/realtime/content-ops CI jobs are intentionally preserved as legacy archive checks.

## Manual Expo/mobile validation

See [`SPRING_MOBILE_VALIDATION.md`](./SPRING_MOBILE_VALIDATION.md) for the 2026-04-27 Spring public-backend validation report.

Status: the available Expo web flow against a public Spring URL passed after minimal contract/runtime fixes, and a later Expo Go tunnel was prepared for phone testing. Spring is now documented as the canonical backend; keep rerunning native Expo Go checks for release readiness when mobile changes land.

## Migration / archive note

Fastify is no longer the active backend because Spring reached functional parity, has Spring smoke coverage, and passed mobile-facing validation work. The Fastify code remains at `backend/` for history and rollback reference. New backend features, fixes, schema changes, runbooks, and tests should be implemented in `backend-spring/`.
