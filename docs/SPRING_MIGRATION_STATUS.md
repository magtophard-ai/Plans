# Spring migration status checkpoint

**Last updated:** 2026-04-27

## Current status

Spring Boot in `backend-spring/` is the current canonical backend for Plans. Fastify in `backend/` is archived legacy code for history, rollback drills, and legacy parity audits only.

Completed Spring checkpoints:

- Scaffold + Flyway/seed:
  - `backend-spring/` Spring Boot scaffold with Java 21 and Gradle wrapper.
  - PostgreSQL datasource config, Flyway migrations, dev seed parity, health endpoint, shared error envelopes, and snake_case JSON output.
- Auth + read-only discovery:
  - OTP auth, refresh/me endpoints, user/friends read APIs, event/venue/search discovery reads.
- User/friend/event write:
  - User profile writes, friend request/accept/remove flows, event interest/save writes and related notification behavior.
- Plans + invitations + notifications:
  - Core plan list/create/detail/lifecycle endpoints, participant list/update/remove/invite, invitation list/accept/decline, notification list/read/read-all.
- Share-link endpoints:
  - `GET /api/plans/by-token/:token`.
  - `POST /api/plans/by-token/:token/join`.
- Proposals + voting.
- Finalize/unfinalize + repeat.
- Plan messages.
- Realtime WebSocket behavior.
- Content ops.
- Mobile-facing validation work from PR #16.

This document is a status/archive checkpoint only. It does not introduce new API implementation work.

## Migration / archive note

Fastify is no longer the active backend because the Spring Boot implementation reached functional parity, passed Spring smoke coverage, and completed mobile-facing validation work. The legacy Fastify code stays in `backend/` so the project retains history and a rollback reference. New backend features, fixes, schema changes, runbooks, and tests should target `backend-spring/`.

## Ongoing canonical backend requirements

- `fullSpringSmokeTest` must stay green in CI.
- Frontend typecheck must stay green.
- Manual Expo/mobile verification should be rerun for release readiness when mobile or runtime-sensitive backend changes land.
- No known API contract mismatches should remain.
- Fastify legacy rollback notes must stay documented and available.
- Production DB baseline/rollback planning must happen before pointing Spring Flyway at an existing production or legacy Fastify-managed database.

## Existing production app was not changed by earlier migration checkpoints

Earlier Spring checkpoint work did not change production frontend deployment, API contracts, or the archived Fastify implementation:

- no production frontend changes in `fest-app/`;
- no contract changes in `contracts/`;
- no legacy Fastify implementation changes in `backend/`.

Spring canonical work lives in `backend-spring/` plus status/planning documentation.

## Local checks historically run

Local Spring verification has been the concrete signal for the completed Spring checkpoints:

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
  - Manual Spring `:3001` smoke for plans, invitations, notifications, and participant invite flows.
- Share-link endpoints:
  - `cd backend-spring && ./gradlew test`
  - Manual Spring `:3001` smoke for share-token preview, join, repeat join, invalid token, full plan, and lifecycle restrictions.

## GitHub Actions / Checks status

The workflow keeps Spring canonical gates, frontend typecheck, and legacy Fastify archive checks.

Canonical Spring Gradle gates:

- `test`
- `coreSmokeTest`
- `realtimeSmokeTest`
- `contentOpsSmokeTest`
- `fullSpringSmokeTest`

Legacy Fastify CI jobs are preserved as archive/rollback checks only.

## Fresh DB limitation

The current Flyway flow is designed for a fresh Spring-managed PostgreSQL database.

Migrating on top of an already existing legacy Fastify-managed database requires a separate baseline strategy, such as:

- `baseline-on-migrate` with a carefully selected baseline version; or
- a manual Flyway baseline plan after comparing the existing legacy schema, enum labels, indexes, constraints, and applied idempotent migrations.

Do not point the current Spring Flyway flow at a production/existing legacy Fastify DB without that separate baseline plan.
