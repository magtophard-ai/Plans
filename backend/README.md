# Планы? Backend — Slice 1

## Prerequisites

- Node.js 18+
- PostgreSQL 15+ running locally with a `plans` database

## Setup

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

## Run

```bash
# Dev (watch mode)
npm run dev

# Production
npm start
```

Server starts at `http://localhost:3001`. Health check: `GET /api/health`.

## Authentication

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

## Slice 1 Endpoints

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

## Typecheck

```bash
npm run typecheck
```
