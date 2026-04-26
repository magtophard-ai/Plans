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

## Not yet covered

- Realtime WebSocket behavior.
- Content ops.

## Package structure

Future slices should use this structure:

- `com.plans.backend.api` — REST/WebSocket API layer.
- `com.plans.backend.api.error` — global exception handling and error envelopes.
- `com.plans.backend.api.health` — health endpoint.
- `com.plans.backend.api.realtime` — future raw JSON WebSocket implementation.
- `com.plans.backend.config` — Spring configuration.
- `com.plans.backend.domain` — domain types.
- `com.plans.backend.service` — business services.
- `com.plans.backend.persistence` — SQL/JDBC persistence.

## Commands

From the repo root:

```bash
cd backend-spring
./gradlew test
```

## Local tests

Run the Spring test suite from the repo root:

```bash
cd backend-spring
./gradlew test
```

The integration tests use Testcontainers and require local Docker access.

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
