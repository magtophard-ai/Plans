# FEST MVP — Runbook (Windows / PowerShell)

This is the Windows/PowerShell runbook that was written for the author's dev
box. For Linux / macOS use `README.md` and `docs/DEMO_SETUP.md` instead; the
steps are equivalent but use docker-based Postgres and bash-style env vars.

All commands below are relative to the repo root (wherever you cloned it).
On the canonical dev box that is `E:\FEST\V1\`; substitute your own clone
path as needed.

## Prerequisites

- Java 21
- Node.js 22.x recommended for Expo/frontend work
- PostgreSQL 17 running on localhost:5432
- `psql` on PATH (or at `C:\Program Files\PostgreSQL\17\bin\`)
- Windows (commands below are PowerShell)

## First-time setup

```powershell
# 1. Create the database
& "C:\Program Files\PostgreSQL\17\bin\psql" -U postgres -c "CREATE DATABASE plans"

# 2. Verify canonical Spring backend wrapper
cd .\backend-spring
.\gradlew.bat test

# 3. Seed demo data after first Spring startup, if needed
cd ..
& "C:\Program Files\PostgreSQL\17\bin\psql" postgres://postgres:postgres@localhost:5432/plans -f backend-spring\src\main\resources\db\seed\R__dev_seed.sql

# 4. Install frontend deps (disk C full on canonical dev box — redirect npm cache)
cd .\fest-app
$env:npm_config_cache="E:\npm-cache"; npm install --legacy-peer-deps
```

## Running

### Backend (terminal 1)

```powershell
cd .\backend-spring
$env:PORT="3001"
.\gradlew.bat bootRun
# → http://localhost:3001
```

### Frontend web (terminal 2)

```powershell
cd .\fest-app
npx expo start --web
# → http://localhost:8081
```

### Frontend mobile dev (terminal 3, optional)

```powershell
cd .\fest-app
$env:EXPO_PUBLIC_API_BASE_URL="http://<YOUR_LAN_IP>:3001/api"
$env:EXPO_PUBLIC_WS_BASE_URL="ws://<YOUR_LAN_IP>:3001/api/ws"
npx expo start --go --tunnel
# Open with Expo Go / emulator from Metro UI
```

Example:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://192.168.0.28:3001/api"
$env:EXPO_PUBLIC_WS_BASE_URL="ws://192.168.0.28:3001/api/ws"
npx expo start --go --tunnel
```

## Environment variables

Canonical backend env for `backend-spring/`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/plans` | PostgreSQL connection string |
| `DATABASE_USERNAME` | `postgres` | PostgreSQL username when `DATABASE_URL` is not used |
| `DATABASE_PASSWORD` | `postgres` | PostgreSQL password when `DATABASE_URL` is not used |
| `JWT_SECRET` | `dev-secret-change-in-prod` | JWT signing key |
| `OTP_CODE` | `1111` | Mock OTP code for all auth |
| `PORT` | `3001` | Backend port expected by local frontend env |

Frontend (runtime env in terminal):

| Variable | Example | Purpose |
|----------|---------|---------|
| `EXPO_PUBLIC_API_BASE_URL` | `http://192.168.0.28:3001/api` | API base URL for mobile/dev builds |
| `EXPO_PUBLIC_WS_BASE_URL` (optional) | `ws://192.168.0.28:3001/api/ws` | WS base override (normally derived from API base) |

Notes:
- Backend already binds to `0.0.0.0`, so it is reachable from phone on LAN.
- Web local keeps working by default (`http://localhost:3001/api`) when `EXPO_PUBLIC_API_BASE_URL` is not set.

## Demo flow

1. **Auth**: Open http://localhost:8081 → enter phone `+79990000000` → tap "Получить код" → enter code `1111` → tap "Войти"
2. **Home feed**: See 6 seeded events with social proof from friends
3. **Search**: Type "джаз" or filter by category/date
4. **Event details**: Tap any event card → see details, venue link, interest/save buttons
5. **Create plan**: Tap "Планы?" button on event or "+" tab → fill form → select friends → create
6. **Plan details**: View plan → propose place/time → vote → finalize
7. **Chat**: Switch to "Чат" tab in plan details → send messages
8. **Invitations**: Go to "Мои планы" → "Приглашения" tab → accept/decline
9. **Groups**: "Мои планы" → "Группы" tab → view group → create plan with group
10. **Profile**: View friends list, saved events, edit name
11. **Notifications**: Bell icon → see plan invite + proposal notifications

## Content Ops v1

Backend-only operator flow now runs through canonical Spring:

```powershell
cd .\backend-spring
$env:SPRING_MAIN_WEB_APPLICATION_TYPE="none"
.\gradlew.bat bootRun --args="import --file ..\docs\examples\content-ops-event.example.json"
.\gradlew.bat bootRun --args="list --state imported"
.\gradlew.bat bootRun --args="show --ingestion-id <id>"
.\gradlew.bat bootRun --args="publish --ingestion-id <id> [--venue-id <venue-id>] [--force-link-event-id <event-id>]"
.\gradlew.bat bootRun --args="sync --file ..\docs\examples\content-ops-event.example.json"
.\gradlew.bat bootRun --args="update --ingestion-id <id>"
.\gradlew.bat bootRun --args="cancel --event-id <id> --reason '...'"
```

`sync` only updates an already-published/linked event; new public rows are created only by explicit `publish`. Venue resolution reuses exact name+address; if no `--venue-id` is supplied and no venue matches, v1 creates a venue with `lat=0/lng=0`, so pass `--venue-id` when coordinates matter. Safe synthetic payload example: `docs/examples/content-ops-event.example.json`.

## Demo accounts

| Phone | Name | Username | Notes |
|-------|------|----------|-------|
| `+79990000000` | Я | me | Primary demo user (has 5 friends) |
| `+79991111111` | Маша | masha | Friend |
| `+79992222222` | Дима | dima | Friend |
| `+79993333333` | Лена | lena | Friend |
| `+79994444444` | Артём | artem | Friend |
| `+79995555555` | Катя | katya | Friend |

All accounts use OTP code `1111`.

## Known limitations

- **No real SMS** — OTP is always `1111`, no SMS is sent
- **No real user registration** — seed creates 6 users; new phones get auto-registered via OTP
- **No user-facing event creation** — public users cannot create events
- **Internal content ops only** — real events can be imported/published via backend CLI from normalized JSON; no parser bots, public admin UI, or venue self-serve
- **Content ops auto-created venues may have `lat/lng=0`** — pass `--venue-id` when coordinates matter
- **No push notifications** — only in-app notifications + WS real-time
- **No map** — locations are text + coordinates only
- **No email auth** — phone-only
- **No group chat** — chat is plan-level only
- **Max 15 participants per plan**
- **Mobile validation is environment-sensitive** — use `docs/DEMO_SETUP.md` when rechecking Expo Go tunnels
- **fest-animations** — isolated from main TypeScript gate; check separately with `npx tsc --noEmit -p tsconfig.fest-animations.json` if needed

## Release checklist

- [ ] `cd fest-app; npx tsc --noEmit` passes (main app only, `src/fest-animations/**` excluded)
- [ ] `cd backend-spring; .\gradlew.bat test` passes
- [ ] `cd backend-spring; .\gradlew.bat coreSmokeTest` passes
- [ ] `cd backend-spring; .\gradlew.bat realtimeSmokeTest` passes
- [ ] `cd backend-spring; .\gradlew.bat contentOpsSmokeTest` passes
- [ ] `cd backend-spring; .\gradlew.bat fullSpringSmokeTest` passes
- [ ] (optional) `npx tsc --noEmit -p tsconfig.fest-animations.json` reviewed separately
- [ ] `npx expo export --platform web` succeeds
- [ ] Spring backend starts on port 3001
- [ ] `/api/health` returns `{ status: "ok" }`
- [ ] Seed loads without error when needed
- [ ] Auth flow works with `+79990000000` / `1111`
- [ ] Home feed loads with seeded events
- [ ] Search returns results
- [ ] Plan creation succeeds
- [ ] Invitation accept/decline works
