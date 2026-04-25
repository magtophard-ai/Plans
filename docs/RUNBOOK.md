# FEST MVP — Runbook (Windows / PowerShell)

This is the Windows/PowerShell runbook that was written for the author's dev
box. For Linux / macOS use `README.md` and `docs/DEMO_SETUP.md` instead; the
steps are equivalent but use docker-based Postgres and bash-style env vars.

All commands below are relative to the repo root (wherever you cloned it).
On the canonical dev box that is `E:\FEST\V1\`; substitute your own clone
path as needed.

## Prerequisites

- Node.js 20+
- PostgreSQL 17 running on localhost:5432
- `psql` on PATH (or at `C:\Program Files\PostgreSQL\17\bin\`)
- Windows (commands below are PowerShell)

## First-time setup

```powershell
# 1. Create the database
& "C:\Program Files\PostgreSQL\17\bin\psql" -U postgres -c "CREATE DATABASE plans"

# 2. Install backend deps (disk C full on canonical dev box — redirect npm cache)
cd .\backend
$env:npm_config_cache="E:\npm-cache"; npm install --legacy-peer-deps

# 3. Run migration
npm run db:migrate

# 4. Seed demo data
npm run db:seed

# 5. Install frontend deps
cd ..\fest-app
$env:npm_config_cache="E:\npm-cache"; npm install --legacy-peer-deps
```

## Running

### Backend (terminal 1)

```powershell
cd .\backend
npm run start
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
npx expo start --go --tunnel
# Open with Expo Go / emulator from Metro UI
```

Example:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://192.168.0.28:3001/api"
npx expo start --go --tunnel
```

## Environment variables

File: `backend\.env` (see `backend\.env.example` for the template)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/plans` | PostgreSQL connection string |
| `JWT_SECRET` | `dev-secret-change-in-prod` | JWT signing key |
| `OTP_CODE` | `1111` | Mock OTP code for all auth |
| `PORT` | `3001` | Backend port (must be 3001 — frontend hardcodes this) |

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
- **No event creation** — events are seed-only, no user-facing form
- **Internal content ops only** — real events can be imported/published via backend CLI from normalized JSON; no parser bots or public admin UI
- **No push notifications** — only in-app notifications + WS real-time
- **No map** — locations are text + coordinates only
- **No email auth** — phone-only
- **No group chat** — chat is plan-level only
- **Max 15 participants per plan**
- **Web-only tested** — mobile builds not verified for this release
- **fest-animations** — isolated from main TypeScript gate; check separately with `npx tsc --noEmit -p tsconfig.fest-animations.json` if needed

## Release checklist

- [ ] `npx tsc --noEmit` passes (main app only, `src/fest-animations/**` excluded)
- [ ] `npx tsc --noEmit` passes in backend
- [ ] (optional) `npx tsc --noEmit -p tsconfig.fest-animations.json` reviewed separately
- [ ] `npx expo export --platform web` succeeds
- [ ] Backend starts on port 3001
- [ ] (optional) Content ops smoke passes: `cd backend && npx tsx src/tests/content-ops-smoke.ts`
- [ ] `/api/health` returns `{ status: "ok" }`
- [ ] Seed runs without error
- [ ] Auth flow works with `+79990000000` / `1111`
- [ ] Home feed loads with 6 events
- [ ] Search returns results
- [ ] Plan creation succeeds
- [ ] Invitation accept/decline works
- [ ] Backend smoke suite passes: `E:\FEST\V1\backend\node_modules\.bin\tsx.cmd E:\FEST\V1\backend\src\tests\e2e-smoke.ts`
- [ ] Realtime smoke suite passes: `E:\FEST\V1\backend\node_modules\.bin\tsx.cmd E:\FEST\V1\backend\src\tests\rt2-smoke.ts`
