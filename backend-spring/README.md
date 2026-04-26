# backend-spring

Spring Boot scaffold for the future Java backend migration.

## Scope

Current scope:

- Java 21.
- Spring Boot 3.x.
- Gradle wrapper as the single build tool.
- `GET /api/health` with the current Fastify response shape: `{"status":"ok"}`.
- Global error envelope foundation: `{"code":"...", "message":"..."}`.
- JDBC DB layer with PostgreSQL driver.
- Flyway controlled migrations copied from `contracts/mvp/db/001_init.sql` and mirrored from `backend/src/db/migrate.ts`.
- Seed parity SQL for current Fastify dev seed.
- No frontend, contract, or existing `backend/` deletion/rewrite.
- Realtime remains a future phase and must keep the raw JSON WebSocket protocol at `/api/ws`; do not introduce STOMP.

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

```bash
./gradlew test
./gradlew bootRun
```

The app reads `PORT` and defaults to `3001`, matching the current backend.

Database config uses:

- `DATABASE_URL` or `jdbc:postgresql://localhost:5432/plans`
- `DATABASE_USERNAME` or `postgres`
- `DATABASE_PASSWORD` or `postgres`

`DATABASE_URL` may be either a JDBC URL or the current Fastify-style `postgres://user:password@host:port/db` URL.

Spring Boot runs Flyway automatically from `src/main/resources/db/migration`. Dev seed parity SQL is available at `src/main/resources/db/seed/R__dev_seed.sql` and is executed by tests; do not run it against production.

## Schema rule

Do not use Hibernate to generate database schema. `spring.jpa.hibernate.ddl-auto=none` is pinned in config; future DB work must mirror `contracts/mvp/db/001_init.sql` and idempotent migrations from `backend/src/db/migrate.ts`.
