# backend-spring

Spring Boot is the current canonical backend for the project.

The old Fastify implementation remains in `../backend` as an archived legacy implementation for history and rollback reference only. New backend changes should target Spring.

## Requirements

- Java 21.
- PostgreSQL 17 for local/manual smoke runs.
- Gradle wrapper as the build tool.

## Current canonical coverage

- Scaffold + Flyway/seed.
- Auth + read-only discovery.
- User/friend/event write.
- Plans + invitations + notifications.
- Proposals + voting:
  - `GET /api/plans/:planId/proposals`
  - `POST /api/plans/:planId/proposals`
  - `POST /api/plans/:planId/proposals/:proposalId/vote`
  - `DELETE /api/plans/:planId/proposals/:proposalId/vote`
- Finalize/unfinalize + repeat:
  - `POST /api/plans/:planId/finalize`
  - `POST /api/plans/:planId/unfinalize`
  - `POST /api/plans/:planId/repeat`
- Plan messages:
  - `GET /api/plans/:planId/messages`
  - `POST /api/plans/:planId/messages`
- Share-link endpoints:
  - `GET /api/plans/by-token/:token`
  - `POST /api/plans/by-token/:token/join`
- Realtime WebSocket parity for REST core mutations:
  - Raw JSON WebSocket at `GET /api/ws`.
  - JWT auth with `auth` / `auth_ok` / `auth_error`.
  - `subscribe` / `unsubscribe` for `user:{userId}` and `plan:{planId}`.
  - Plan events: `plan.message.created`, `plan.proposal.created`, `plan.vote.changed`,
    `plan.finalized`, `plan.unfinalized`, `plan.cancelled`, `plan.completed`,
    `plan.participant.added`, `plan.participant.updated`, `plan.participant.removed`.
  - User event: `notification.created`.
- Content ops CLI parity:
  - `import`, `list`, `show`, `publish`, `update`, `sync`, `cancel`.
  - Internal staged `event_ingestions` flow; no public admin HTTP endpoints.
  - Explicit publish into public `events`.
  - Update/cancel propagation through existing notifications.

## Canonical backend boundary

- Spring functional parity and mobile-facing validation are complete.
- Spring is the active backend path for local development, CI smoke verification, content ops, and new backend changes.
- Fastify is not removed, but it is archived in `../backend` and should only be used for rollback/history checks.
- See `../docs/SPRING_SWITCHOVER.md` for the Spring canonical runbook, smoke commands, frontend env, content ops commands, and archived Fastify rollback note.

## Package structure

Future slices should use this structure:

- `com.plans.backend.api` — REST/WebSocket API layer.
- `com.plans.backend.api.error` — global exception handling and error envelopes.
- `com.plans.backend.api.health` — health endpoint.
- `com.plans.backend.api.realtime` — raw JSON WebSocket implementation.
- `com.plans.backend.config` — Spring configuration.
- `com.plans.backend.domain` — domain types.
- `com.plans.backend.service` — business services.
- `com.plans.backend.persistence` — SQL/JDBC persistence.

## Commands

From the repo root:

```bash
cd backend-spring
./gradlew test
./gradlew coreSmokeTest
./gradlew realtimeSmokeTest
./gradlew contentOpsSmokeTest
./gradlew fullSpringSmokeTest
```

## Local tests

Run the Spring test suite from the repo root:

```bash
cd backend-spring
./gradlew test
```

The integration tests use Testcontainers and require local Docker access.

## Spring REST core smoke

Run from the repo root:

```bash
cd backend-spring
./gradlew coreSmokeTest
```

The smoke uses Spring Boot + MockMvc against the real HTTP controller layer with a
PostgreSQL 17 Testcontainers database. It does not start Fastify, the frontend, realtime,
or content ops.

Required local env:

- Java 21.
- Docker access for Testcontainers.

The test pins dev values via Spring test properties:

- `JWT_SECRET=dev-secret`
- `OTP_CODE=1111`

Smoke coverage:

- health/startup check;
- dev OTP login/auth;
- authenticated events list;
- create/list/get plan;
- share-token preview and join;
- invite/list participants;
- create place and time proposals, including valid `value_datetime`;
- vote/unvote;
- finalize and verify proposal/vote actions are blocked;
- unfinalize and verify proposal/vote work again;
- post message with `client_message_id`;
- duplicate message idempotency with no duplicate row;
- list messages and verify `proposal_card`, `system`, and `user` message types;
- complete plan;
- repeat completed plan;
- list/read/read-all notifications.

Known behavior intentionally outside this smoke:

- Realtime WebSocket behavior.
- Content ops.

## Spring realtime smoke

Run from the repo root:

```bash
cd backend-spring
./gradlew realtimeSmokeTest
```

The smoke starts Spring on a random local port, connects real WebSocket clients to
`/api/ws`, and drives mutations through REST. WebSocket remains push-only: REST is still the
source of truth for writes.

Required local env:

- Java 21.
- Docker access for Testcontainers.

The test pins dev values via Spring test properties:

- `JWT_SECRET=dev-secret`
- `OTP_CODE=1111`

Smoke coverage:

- JWT WebSocket auth;
- `plan:{planId}` subscribe for participants;
- forbidden outsider subscribe to another user's plan;
- `user:{userId}` notification channel subscribe;
- plan events for message, proposal, vote/unvote, participant add/update/remove,
  finalize, unfinalize, complete, and cancel;
- `notification.created` on invite notification creation.

Known behavior intentionally outside this smoke:

- Content ops.

## Spring content ops smoke

Run from the repo root:

```bash
cd backend-spring
./gradlew contentOpsSmokeTest
```

The smoke uses Spring Boot + MockMvc/service calls against PostgreSQL 17
Testcontainers. It mirrors the existing Fastify CLI-only content ops contract:
there are no public admin endpoints and no frontend flow.

Required local env:

- Java 21.
- Docker access for Testcontainers.

Smoke coverage:

- import/stage normalized content into `event_ingestions`;
- list staged content and show one ingestion;
- re-import with the same source key to edit staged content;
- `sync` is update-only and returns `skipped: "not published yet; run ops:publish"`
  without creating a public event;
- explicit publish creates/updates one public event;
- repeated sync/publish does not create duplicate events or venues;
- duplicate detection by source fingerprint and legacy fallback by normalized title
  + venue name/address + `starts_at`;
- duplicate candidates require explicit `--force-link-event-id`;
- venue resolution reuses exact name+address, otherwise creates a venue with
  `lat=0` / `lng=0`;
- update of an existing linked event emits `event_time_changed` notifications;
- cancel marks the event cancelled, hides it from public lists/search/venue events,
  keeps detail readable, and emits `event_cancelled` notifications;
- invalid input, not found, and unauthorized error envelopes.

Known behavior:

- Content ops is CLI/internal only. Operators provide already-normalized JSON;
  `source_url` is metadata only and no fetching/parsing is attempted.
- `sync` never creates a public event. New public rows require explicit publish.
- Publish is explicit and transactional.
- Duplicate protection checks exact source key first, then fingerprint, then the
  legacy normalized-title/venue/address/time fallback without backfilling legacy rows.
- Venue auto-create uses `lat=0` / `lng=0`; pass `--venue-id` when coordinates matter.

Local CLI run examples:

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

Equivalent long-form command style is also supported:

```bash
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="--content-ops=import --file ../docs/examples/content-ops-event.example.json"
```

Local run on Spring `:3001`:

```bash
cd backend-spring
PORT=3001 ./gradlew bootRun
```

The app reads `PORT` and defaults to `3001`, matching the frontend's expected local backend port.

Database config uses:

- `DATABASE_URL` or `jdbc:postgresql://localhost:5432/plans`
- `DATABASE_USERNAME` or `postgres`
- `DATABASE_PASSWORD` or `postgres`

`DATABASE_URL` may be either a JDBC URL or a legacy-compatible
`postgres://user:password@host:port/db` URL.

Spring Boot runs Flyway automatically from `src/main/resources/db/migration`.

Dev seed parity SQL is available at
`src/main/resources/db/seed/R__dev_seed.sql` and is executed by tests; do not run it against
production.

Current Flyway migrations are intended for a fresh Spring-managed database.
Connecting this Spring app to an existing legacy Fastify-managed database requires a separate
baseline-on-migrate/manual baseline plan before enabling Flyway against that database.

## Local smoke outline

For manual Spring smoke testing, use a fresh local PostgreSQL 17 database, start Spring on `:3001`,
and exercise the relevant parity slice through HTTP.

Typical smoke steps:

1. Prepare a fresh `plans` database and apply Spring Flyway migrations.
2. Load dev seed data from `src/main/resources/db/seed/R__dev_seed.sql`.
3. Start Spring with `PORT=3001 ./gradlew bootRun`.
4. Verify `GET /api/health`.
5. Verify OTP auth with dev code `1111`.
6. Exercise only the endpoints in the current parity slice.

## Spring full network smoke

Run from the repo root:

```bash
cd backend-spring
./gradlew fullSpringSmokeTest
```

This is the canonical Spring network smoke. It starts Spring Boot on a random
local port as a real web server, uses PostgreSQL 17 through Testcontainers,
calls `localhost` through Java's real HTTP client, and connects a real
WebSocket client to `/api/ws`.

Smoke coverage:

- health/startup;
- dev OTP auth (`OTP_CODE=1111`);
- authenticated events list;
- create/list/get plan;
- share-token preview and join;
- participants invite/list;
- proposals;
- vote/unvote;
- finalize/unfinalize;
- messages and `client_message_id` dedup;
- realtime event over real WebSocket;
- complete/repeat;
- notifications list/read/read-all;
- content ops service path coverage for import/list/sync/publish/error handling.

This smoke is intentionally network-level so it catches wrong ports,
context-path mistakes, JSON serialization issues, broken Authorization headers,
WebSocket endpoint failures, and Spring Boot startup issues that MockMvc-only
tests can miss.

## Frontend env against Spring

Local frontend env:

```bash
cd fest-app
export EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api
unset EXPO_PUBLIC_WS_BASE_URL
npx expo start --web
```

When `EXPO_PUBLIC_WS_BASE_URL` is unset, the frontend derives
`ws://localhost:3001/api/ws` from the API URL. For HTTPS tunnels/mobile testing,
set `EXPO_PUBLIC_WS_BASE_URL=wss://<backend-host>/api/ws` before Metro starts.

## Archived Fastify rollback

Fastify is archived legacy code. Use it only when explicitly validating or restoring legacy behavior:

```bash
cd backend
npm install --legacy-peer-deps
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run start
```

Keep the local frontend URL at `http://localhost:3001/api`, or point the Expo
env vars at the legacy Fastify tunnel when performing a rollback drill.

## Schema rule

Do not use Hibernate to generate database schema.

`spring.jpa.hibernate.ddl-auto=none` is pinned in config; future DB work belongs in Flyway migrations under `backend-spring/src/main/resources/db/migration` and must remain compatible with `contracts/mvp/db/001_init.sql`.

## Migration boundary

Do not change frontend product logic, API contracts, or remove the archived legacy
`backend/` implementation unless a later task explicitly expands scope.
