# backend-spring

Spring Boot backend migration target.
Fastify remains canonical until full Spring parity and switchover are complete.

## Requirements

- Java 21.
- PostgreSQL 17 for local/manual smoke runs.
- Gradle wrapper as the build tool.

## Current parity coverage

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

## Not yet covered

- Content ops.

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

Known gaps intentionally outside this smoke:

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

Known gap intentionally outside this smoke:

- Content ops.

Local run on Spring `:3001`:

```bash
cd backend-spring
PORT=3001 ./gradlew bootRun
```

The app reads `PORT` and defaults to `3001`, matching the current Fastify backend.

Database config uses:

- `DATABASE_URL` or `jdbc:postgresql://localhost:5432/plans`
- `DATABASE_USERNAME` or `postgres`
- `DATABASE_PASSWORD` or `postgres`

`DATABASE_URL` may be either a JDBC URL or the current Fastify-style
`postgres://user:password@host:port/db` URL.

Spring Boot runs Flyway automatically from `src/main/resources/db/migration`.

Dev seed parity SQL is available at
`src/main/resources/db/seed/R__dev_seed.sql` and is executed by tests; do not run it against
production.

Current Flyway migrations are intended for a fresh Spring-managed database.
Connecting this Spring app to an existing Fastify-managed database requires a separate
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

## Schema rule

Do not use Hibernate to generate database schema.

`spring.jpa.hibernate.ddl-auto=none` is pinned in config; future DB work must mirror
`contracts/mvp/db/001_init.sql` and idempotent migrations from `backend/src/db/migrate.ts`.

## Migration boundary

Do not change `fest-app/`, `contracts/`, or the old `backend/` as part of Spring-only migration
slices unless a later task explicitly expands scope.
