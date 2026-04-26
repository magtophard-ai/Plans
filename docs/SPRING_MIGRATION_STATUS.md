# Spring migration status checkpoint

**Last updated:** 2026-04-26

## Current status

This checkpoint records the Spring migration state at the Spring scaffold +
DB/Flyway/seed parity milestone:

- `backend-spring/` exists as a Spring Boot scaffold with Java 21, Gradle wrapper,
  PostgreSQL datasource config, health endpoint, shared error envelope handling,
  and snake_case JSON output.
- DB/Flyway/seed parity is in place for the current MVP schema on a fresh
  Spring-managed PostgreSQL database.
- The checkpoint is limited to Spring infrastructure, DB migrations, and dev
  seed verification.

This document is a status checkpoint only. It does not introduce new API
implementation work.

## PR #1: Spring DB/Flyway/seed checkpoint

Merged PR: <https://github.com/dotagovnos1/Plans/pull/1>

PR #1 added the Spring database baseline and verification foundation:

- Added `backend-spring/` Spring Boot project scaffold and Gradle wrapper.
- Added Flyway migrations under `backend-spring/src/main/resources/db/migration/`:
  - `V1__baseline_schema.sql` based on `contracts/mvp/db/001_init.sql`;
  - `V2__idempotent_fastify_migrations.sql` matching the current Fastify-side
    idempotent DB migrations.
- Added Spring DB config that accepts Fastify-style `postgres://...` database
  URLs, including default PostgreSQL port `5432` when no port is present.
- Added dev seed support under `backend-spring/src/main/resources/db/seed/` plus
  `DevSeedRunner`.
- Added migration/seed tests using Docker/Testcontainers.
- Fixed review issues in the initial migration branch:
  - removed explicit top-level `BEGIN`/`COMMIT` from the Flyway migration so
    Flyway owns transaction boundaries;
  - made Testcontainers DB settings override ambient `DATABASE_URL` reliably;
  - removed test ordering dependency from migration tests.

## Existing production app was not changed

The production Expo frontend, API contracts, and existing Fastify backend remain
unchanged by the Spring checkpoint work:

- no production frontend changes in `fest-app/`;
- no contract changes in `contracts/`;
- no old Fastify backend implementation changes in `backend/`.

Spring migration work is isolated to `backend-spring/` plus status/planning
documentation.

## Local checks actually run

The following local checks were actually run while preparing PR #1:

- For PR #1 DB/Flyway/seed checkpoint:
  - `cd backend-spring && ./gradlew test`
  - Result: `BUILD SUCCESSFUL` with Docker/Testcontainers available.
- PR #1 notes also recorded that GitHub Actions were not running in this fork
  state, so local Docker/Testcontainers verification was the concrete executed
  check for that checkpoint.

## GitHub Actions / Checks status

GitHub Actions workflows were not running in this fork/repo state at the time of
these checkpoints. If the GitHub Checks page shows `0` checks / `0` workflow
runs, do not treat that as GitHub CI green.

The verification above is local verification plus any Devin Review check shown
on the PR. A zero-check GitHub Actions page is explicitly not a passing CI
signal.

## Fresh DB limitation

The current Flyway flow is designed for a fresh Spring-managed PostgreSQL
database.

Migrating on top of an already existing Fastify-managed database is not covered
by this checkpoint and requires a separate baseline strategy, such as:

- `baseline-on-migrate` with a carefully selected baseline version; or
- a manual Flyway baseline plan after comparing the existing Fastify DB schema,
  enum labels, indexes, constraints, and applied idempotent migrations.

Do not point the current Spring Flyway flow at a production/existing Fastify DB
without that separate baseline plan.

## Next step

The next implementation step after the DB/Flyway/seed checkpoint is Spring
auth + read-only discovery parity, without changing the production frontend,
contracts, or old Fastify backend.

That parity slice is expected to cover:

- `POST /api/auth/otp/send`
- `POST /api/auth/otp/verify`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `GET /api/users/me`
- `GET /api/users/:id`
- `GET /api/users/friends`
- `GET /api/events`
- `GET /api/events/:id`
- `GET /api/venues/:id`
- `GET /api/venues/:id/events`
- `GET /api/search/events`
