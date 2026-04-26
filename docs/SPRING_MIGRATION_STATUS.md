# Spring migration status checkpoint

**Last updated:** 2026-04-26

## Current status

Spring migration work is progressing in small parity checkpoints. Fastify remains
the canonical backend until Spring reaches full parity and the production
switchover is explicitly completed.

Completed Spring parity checkpoints:

- Scaffold + Flyway/seed:
  - `backend-spring/` Spring Boot scaffold with Java 21 and Gradle wrapper.
  - PostgreSQL datasource config, Flyway migrations, dev seed parity, health
    endpoint, shared error envelopes, and snake_case JSON output.
- Auth + read-only discovery:
  - OTP auth, refresh/me endpoints, user/friends read APIs, event/venue/search
    discovery reads.
- User/friend/event write:
  - User profile writes, friend request/accept/remove flows, event interest/save
    writes and related notification behavior.
- Plans + invitations + notifications:
  - Core plan list/create/detail/lifecycle endpoints, participant list/update/
    remove/invite, invitation list/accept/decline, notification list/read/read-all.
- Share-link endpoints:
  - `GET /api/plans/by-token/:token`.
  - `POST /api/plans/by-token/:token/join`.

This document is a status checkpoint only. It does not introduce new API
implementation work.

## Still pending Spring parity

The following Fastify-backed areas are not yet fully covered by Spring parity:

- Proposals + voting.
- Finalize/unfinalize + repeat.
- Plan messages.
- Realtime WebSocket behavior.
- Content ops.
- Full CI and production switchover to Spring.

Do not treat Spring as the canonical backend until these pending areas and the
switchover are complete.

## Existing production app was not changed

The production Expo frontend, API contracts, and existing Fastify backend remain
unchanged by the Spring checkpoint work:

- no production frontend changes in `fest-app/`;
- no contract changes in `contracts/`;
- no old Fastify backend implementation changes in `backend/`.

Spring migration work is isolated to `backend-spring/` plus status/planning
documentation.

## Local checks actually run

Local Spring verification has been the concrete signal for the completed Spring
checkpoints:

- Scaffold + Flyway/seed:
  - `cd backend-spring && ./gradlew test`
  - Result: `BUILD SUCCESSFUL` with Docker/Testcontainers available.
- Auth + read-only discovery:
  - `cd backend-spring && ./gradlew test`
  - Manual Spring `:3001` smoke for OTP and read-only discovery flows.
- User/friend/event write:
  - `cd backend-spring && ./gradlew test`
  - Manual Spring `:3001` smoke for user, friend, and event write flows.
- Plans + invitations + notifications:
  - `cd backend-spring && ./gradlew test`
  - Manual Spring `:3001` smoke for plans, invitations, notifications, and
    participant invite flows.
- Share-link endpoints:
  - `cd backend-spring && ./gradlew test`
  - Manual Spring `:3001` smoke for share-token preview, join, repeat join,
    invalid token, full plan, and lifecycle restrictions.

## GitHub Actions / Checks status

GitHub Actions have not provided a reliable Spring CI signal for these Spring
checkpoints. If the GitHub Checks page shows `0` checks / `0` workflow runs, do
not treat that as GitHub CI green.

The current workflow configuration is still Fastify/frontend oriented and does
not run `backend-spring` Gradle tests as the Spring parity gate. Until Spring CI
is explicitly added and running, the verification above is local verification
plus any PR review signal shown on the PR.

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
