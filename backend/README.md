# Планы? Legacy Fastify Backend

This directory is an archived legacy Fastify implementation. Spring Boot in `../backend-spring/` is the current canonical backend for active development, CI smoke work, runbooks, and new backend changes.

Keep this code for history, rollback drills, and legacy parity audits only. Do not add new product backend functionality here unless explicitly restoring or auditing legacy behavior.

## Prerequisites

- Node.js 22.x
- PostgreSQL 17 running locally with a `plans` database

## Legacy setup

From the repo root:

```bash
cd backend

# Install (Linux / macOS)
npm install --legacy-peer-deps

# Install (Windows / PowerShell — disk C full on canonical dev box, redirect cache)
# $env:npm_config_cache="E:\npm-cache"; npm install --legacy-peer-deps

# Create database (docker; see docs/DEMO_SETUP.md for Windows native PG service)
docker run -d --name fest-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=plans postgres:17

# Run migration
npm run db:migrate

# Seed dev data
npm run db:seed

# Copy env
cp .env.example .env       # Windows: copy .env.example .env
# Edit .env with your DATABASE_URL
```

## Legacy run

```bash
# Dev (watch mode)
npm run dev

# Production
npm start
```

Server starts at `http://localhost:3001`. Health check: `GET /api/health`.

## Legacy Content Ops v1

The canonical content-ops path is Spring in `../backend-spring/`. This legacy implementation is CLI-only and consumes manually normalized JSON.
`source_url` is metadata only; the backend does not fetch or parse arbitrary
URLs.

```bash
# Example payload:
# ../docs/examples/content-ops-event.example.json

npm run ops:import -- --file ../docs/examples/content-ops-event.example.json
npm run ops:list -- --state imported
npm run ops:publish -- --ingestion-id <id> [--venue-id <id>] [--force-link-event-id <id>]
npm run ops:sync -- --file ../docs/examples/content-ops-event.example.json
npm run ops:update -- --ingestion-id <id>
npm run ops:cancel -- --event-id <id> --reason "..."
npm run ops:content -- <command>
```

`ops:sync` updates only already-published/linked events and never creates a
public event before explicit `ops:publish`. Duplicate candidates require
operator confirmation via `--force-link-event-id`. If no `--venue-id` is passed,
publish reuses exact venue name+address or may create `lat=0/lng=0`.

## Legacy authentication

All endpoints except `/api/auth/otp/send` and `/api/auth/otp/verify` require a Bearer JWT.

Dev OTP: any phone + code `1111`.

```bash
# Send OTP
curl -X POST http://localhost:3001/api/auth/otp/send -H "Content-Type: application/json" -d '{"phone":"+79990000000"}'

# Verify
curl -X POST http://localhost:3001/api/auth/otp/verify -H "Content-Type: application/json" -d '{"phone":"+79990000000","code":"1111"}'

# Use returned access_token as Bearer
export TOKEN=<access_token>
curl http://localhost:3001/api/events -H "Authorization: Bearer $TOKEN"
```

## Legacy endpoint archive

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/otp/send | Send OTP |
| POST | /api/auth/otp/verify | Verify OTP, get tokens |
| POST | /api/auth/refresh | Refresh token pair |
| GET | /api/auth/me | Current user |
| GET | /api/users/me | Profile |
| PATCH | /api/users/me | Update profile |
| GET | /api/users/:id | User by ID |
| GET | /api/users/friends | Friend list |
| POST | /api/users/friends/:id | Add friend |
| DELETE | /api/users/friends/:id | Remove friend |
| GET | /api/events | Event list with social proof |
| GET | /api/events/:id | Event detail |
| POST | /api/events/:id/interest | Toggle interest on |
| DELETE | /api/events/:id/interest | Toggle interest off |
| POST | /api/events/:id/save | Save event |
| DELETE | /api/events/:id/save | Unsave event |
| GET | /api/venues/:id | Venue detail |
| GET | /api/venues/:id/events | Events at venue |
| GET | /api/plans | Plan list (filterable) |
| POST | /api/plans | Create plan (atomic) |
| GET | /api/plans/:id | Plan detail |
| PATCH | /api/plans/:id | Update plan (pre-meet only) |
| POST | /api/plans/:id/cancel | Cancel plan |
| POST | /api/plans/:id/complete | Complete plan |
| GET | /api/plans/:planId/participants | Participant list |
| PATCH | /api/plans/:planId/participants/:uid | Update status |
| DELETE | /api/plans/:planId/participants/:uid | Remove participant |
| GET | /api/invitations | Invitation list |
| PATCH | /api/invitations/:id | Accept/decline |
| GET | /api/groups | Group list |
| POST | /api/groups | Create group |
| GET | /api/groups/:id | Group detail |
| POST | /api/groups/:id/members | Add member |
| DELETE | /api/groups/:id/members/:uid | Remove member |
| GET | /api/notifications | Notification list + unread count |
| PATCH | /api/notifications/:id/read | Mark read |
| PATCH | /api/notifications/read-all | Mark all read |
| GET | /api/search/events | Search events |

## Legacy typecheck

```bash
npm run typecheck
```

## Legacy smoke tests

Run with the backend already listening on `:3001` and
`DATABASE_URL=postgres://postgres:postgres@localhost:5432/plans`:

```bash
npx tsx src/tests/content-ops-smoke.ts
npx tsx src/tests/e2e-smoke.ts
npx tsx src/tests/rt2-smoke.ts
```
