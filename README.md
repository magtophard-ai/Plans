# Планы? / FEST MVP

Expo + Fastify + PostgreSQL MVP of the "Планы?" / FEST app.

## Quick links

- [`docs/CURRENT_STATUS.md`](./docs/CURRENT_STATUS.md) — **single source of
  truth** for what is shipped and how the stack is wired today.
- [`docs/HANDOFF.md`](./docs/HANDOFF.md) — forward-looking handoff: roadmap,
  open PRs/branches, gotchas, "how to resume".
- [`docs/DEMO_SETUP.md`](./docs/DEMO_SETUP.md) — runbook for standing the
  demo stack up on a phone via Expo Go (Postgres → backend → cloudflared
  → Expo tunnel → QR).
- [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) — original Windows runbook.
- [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — CI gate
  (typecheck + backend smoke + realtime smoke).

## Repo layout

- `fest-app/` — frontend (Expo React Native, web + mobile)
- `backend/` — Fastify + PostgreSQL API
- `contracts/` — OpenAPI + DB schema + acceptance docs
- `docs/` — status, handoff, runbooks, testing artifacts

## Quick start — Linux / macOS (bash / zsh)

```bash
# Postgres (docker)
docker run -d --name fest-pg \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=plans \
  postgres:17

# Backend
cd backend
npm install
echo 'DATABASE_URL=postgres://postgres:postgres@localhost:5432/plans' > .env
echo 'JWT_SECRET=dev-secret-change-in-prod' >> .env
echo 'OTP_CODE=1111' >> .env
echo 'PORT=3001' >> .env
npm run db:migrate
npm run db:seed
npm run start   # listens on :3001

# Frontend (web)
cd ../fest-app
npm install --legacy-peer-deps
npx expo start --web
```

Auth: any seeded phone (e.g. `+79990000000`) + OTP code `1111`.

For phone testing via Expo Go tunnel, follow
[`docs/DEMO_SETUP.md`](./docs/DEMO_SETUP.md) — backend must be publicly
reachable (cloudflared), and `EXPO_PUBLIC_API_BASE_URL` /
`EXPO_PUBLIC_WS_BASE_URL` must be exported **before** Metro starts.

## Quick start — Windows (PowerShell)

On the canonical Windows dev box disk `C:` is full (see
[`AGENTS.md`](./AGENTS.md)), so all npm commands must redirect cache to a
volume that has space. Paths below use `.\backend` / `.\fest-app` relative
to wherever you cloned the repo — substitute your own absolute path if
needed.

```powershell
# From the repo root

# Backend
cd .\backend
$env:npm_config_cache="E:\npm-cache"; npm install --legacy-peer-deps
npx tsx src\db\migrate.ts
npx tsx src\db\seed.ts
$env:PORT="3001"; npx tsx src\index.ts

# Frontend
cd ..\fest-app
$env:npm_config_cache="E:\npm-cache"; npm install --legacy-peer-deps
npx expo start --web
```

Windows uses a native PostgreSQL service (`postgresql-x64-17`) instead of
docker — see `AGENTS.md` for `psql` and connection details.

## Quality gate (local)

- Backend typecheck: `cd backend && npx tsc --noEmit`
- Frontend typecheck: `cd fest-app && npx tsc --noEmit`
- Optional animation sandbox: `cd fest-app && npx tsc --noEmit -p tsconfig.fest-animations.json`
- Backend REST smoke: `cd backend && npx tsx src/tests/e2e-smoke.ts` (needs backend running)
- Backend realtime smoke: `cd backend && npx tsx src/tests/rt2-smoke.ts` (needs backend running)

`fest-app/src/fest-animations/**` is intentionally excluded from the main
frontend TypeScript gate.

## CI

Every PR and every push to `master` runs four jobs in parallel
([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)):

- `backend typecheck`
- `frontend typecheck`
- `backend e2e smoke` — Postgres 17 service, migrate, seed, start backend, `e2e-smoke.ts`
- `backend realtime smoke` — same setup, `rt2-smoke.ts`

All four must be green to merge.

## Phone testing via Expo Go

See [`docs/DEMO_SETUP.md`](./docs/DEMO_SETUP.md) for the full recipe. The
short version: the backend must be publicly reachable (cloudflared or
equivalent), and `EXPO_PUBLIC_API_BASE_URL` + `EXPO_PUBLIC_WS_BASE_URL`
must be exported in the same shell **before** `npx expo start --tunnel --go`
so they end up baked into the JS bundle Expo Go downloads.
