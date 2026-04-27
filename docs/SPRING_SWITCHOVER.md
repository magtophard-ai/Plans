# Spring switchover candidate

Spring functional parity is reached. This PR prepares Spring to become the
canonical backend candidate by making the local runbook, docs, CI, and a final
network smoke explicit. It is not the final production switchover.

Fastify remains in `backend/` as fallback/reference until a later PR declares
Spring canonical and keeps a verified rollback path.

## Current backend audit

### Fastify today

- Local backend: `cd backend && npm install --legacy-peer-deps`.
- Env: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/plans`,
  `JWT_SECRET=dev-secret-change-in-prod`, `OTP_CODE=1111`, `PORT=3001`,
  `NODE_ENV=development`.
- Migrate/seed: `npm run db:migrate && npm run db:seed`.
- Run: `npm run start` or `npm run dev`; API is `http://localhost:3001/api`.
- Realtime: `ws://localhost:3001/api/ws`.
- Content ops fallback: `npm run ops:import`, `ops:list`, `ops:show` via
  `ops:content`, `ops:publish`, `ops:update`, `ops:sync`, `ops:cancel`.
- CI still runs Fastify `backend typecheck`, `backend e2e smoke`,
  `backend realtime smoke`, and `backend content ops smoke`.

### Spring today

- Local backend: `cd backend-spring && ./gradlew bootRun`.
- Env: `DATABASE_URL` accepts either `postgres://...` or `jdbc:postgresql://...`;
  `DATABASE_USERNAME`/`DATABASE_PASSWORD` default to `postgres`; `PORT` defaults
  to `3001`; `JWT_SECRET` defaults to `dev-secret`; `OTP_CODE` defaults to
  `1111`.
- Migrations: Flyway runs automatically from
  `backend-spring/src/main/resources/db/migration` against a fresh
  Spring-managed database.
- Seed: dev seed SQL is `backend-spring/src/main/resources/db/seed/R__dev_seed.sql`.
  It is loaded by tests and can be loaded manually for local app runs.
- Run: `PORT=3001 ./gradlew bootRun`; API is `http://localhost:3001/api`.
- Realtime: raw JSON WebSocket at `ws://localhost:3001/api/ws`.
- Content ops: CLI-only through `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="..."`.
- CI runs `backend-spring test`, `core smoke`, `realtime smoke`,
  `content ops smoke`, and now `full smoke`.

### Frontend env for Spring

- Set `EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api`.
- Leave `EXPO_PUBLIC_WS_BASE_URL` unset for local Spring; the frontend derives
  `ws://localhost:3001/api/ws`.
- For public HTTPS tunnel/mobile testing, set both:
  - `EXPO_PUBLIC_API_BASE_URL=https://<backend-host>/api`
  - `EXPO_PUBLIC_WS_BASE_URL=wss://<backend-host>/api/ws`
- Dev auth remains mock OTP: any seeded phone, for example `+79990000000`,
  verifies with code `1111`. JWT is returned by `/api/auth/otp/verify` and sent
  as `Authorization: Bearer <token>`.

## Spring-first local run

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

The Spring Flyway flow is intended for a fresh Spring-managed DB. Do not point
it at an existing production/Fastify-managed DB without a separate Flyway
baseline plan.

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

Spring tests load the dev seed automatically. For a manual local app run, load
the seed SQL into the fresh Spring DB:

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
unset EXPO_PUBLIC_WS_BASE_URL
npx expo start --web
```

WebSocket behavior:

- If `EXPO_PUBLIC_WS_BASE_URL` is set, it is used directly.
- If unset, `fest-app/src/api/client.ts` derives it from
  `EXPO_PUBLIC_API_BASE_URL` by mapping `http` to `ws`, `https` to `wss`, and
  `/api` to `/api/ws`.
- Local Spring therefore derives `ws://localhost:3001/api/ws`.

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

Spring checks:

```bash
cd backend-spring
./gradlew test
./gradlew coreSmokeTest
./gradlew realtimeSmokeTest
./gradlew contentOpsSmokeTest
./gradlew fullSpringSmokeTest
./gradlew compileJava
```

`fullSpringSmokeTest` starts Spring on a random local port with PostgreSQL via
Testcontainers, calls real HTTP on `localhost`, connects a real WebSocket client
to `/api/ws`, and exercises health, OTP auth, events, plan CRUD/list/detail,
share-token preview/join, participants invite/list, proposals, vote/unvote,
finalize/unfinalize, messages with `client_message_id` dedup, realtime events,
complete/repeat, notifications, and content ops service-path coverage.

Frontend contract check when env/docs/scripts touch frontend startup:

```bash
cd fest-app
npx tsc --noEmit
```

Fastify fallback checks remain:

```bash
cd backend
npx tsc --noEmit
npx tsx src/tests/e2e-smoke.ts
npx tsx src/tests/rt2-smoke.ts
npx tsx src/tests/content-ops-smoke.ts
```

The smoke scripts require Fastify already running on `:3001` with migrated and
seeded Postgres.

## Rollback path to Fastify

1. Stop Spring.
2. Start Fastify:
   ```bash
   cd backend
   npm install --legacy-peer-deps
   cp .env.example .env
   npm run db:migrate
   npm run db:seed
   npm run start
   ```
3. Keep frontend env unchanged for local fallback:
   ```bash
   export EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api
   unset EXPO_PUBLIC_WS_BASE_URL
   ```
4. For a public/mobile fallback URL, point `EXPO_PUBLIC_API_BASE_URL` and
   `EXPO_PUBLIC_WS_BASE_URL` at the Fastify tunnel instead of the Spring tunnel.

Fastify smoke/realtime/content-ops CI jobs are intentionally preserved.

## Manual Expo/mobile validation

See [`SPRING_MOBILE_VALIDATION.md`](./SPRING_MOBILE_VALIDATION.md) for the
2026-04-27 Spring public-backend validation report.

Status: the available Expo web flow against a public Spring URL passed after
minimal contract/runtime fixes. Native Expo Go tunnel validation was not
completed because the Expo/ngrok tunnel failed in the VM, so a strict real-device
Expo Go pass should be rerun before declaring Spring canonical if that is a hard
requirement.

## Criteria for the next PR to declare Spring canonical default

- `fullSpringSmokeTest` is green in CI.
- `frontend typecheck` is green.
- Manual Expo/mobile check against the Spring URL has passed.
- No known API contract mismatches remain.
- Fastify fallback remains documented and verified.
- A production rollout plan includes a DB baseline/rollback plan; no dangerous
  production Flyway switch is attempted without it.
