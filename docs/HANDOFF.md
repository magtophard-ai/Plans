# Session Handoff — 2026-04-24 (post demo-stack + Phase-0)

This document is the forward-looking handoff: **what is next, which
branches/PRs are in flight, and the gotchas you will hit on a fresh clone**.
For "what is shipped today", read [`docs/CURRENT_STATUS.md`](./CURRENT_STATUS.md).
For a step-by-step runbook to stand the demo stack up for real-device testing
through Expo Go, read [`docs/DEMO_SETUP.md`](./DEMO_SETUP.md).

Previous handoff (P2 — onboarding + empty states) was delivered and merged;
its content is now reflected in `CURRENT_STATUS.md`. The old version of this
file (2026-04-22) is preserved in git history if you need the P1/P2 narrative.

---

## TL;DR

- Roadmap through P3 (observability) + Phase-0 (docs alignment + CI) are
  all on master. P4+ is pending and unblocked by CI now existing.
- **No open PRs.** The demo-stack fixes (PR #1) and Phase-0 cleanup (PR #2)
  are both merged.
- **Next recommended milestone**: P4 dark theme or P5 integration tests —
  user has not picked between them yet.

---

## 1. Open PRs / branches

| Branch | Purpose | State |
|--------|---------|-------|
| `master` | Production trunk | P0a, P1, P2, P3, demo-stack, Phase-0 merged |

There are no in-flight feature branches. Safe to delete any `devin/*` feature
branches locally and remotely — master is the source of truth.

---

## 2. Roadmap

Order and reasoning are the user's own choices — don't reorder silently.

| # | Item | Status |
|---|------|--------|
| P0a | Friends pending/accept flow + pickers | merged |
| P0b | Real SMS OTP provider | **explicitly skipped** — keep `OTP_CODE=1111` until the user asks |
| P1 | Plan share link + deep link | merged |
| P2 | Onboarding + human empty states | merged |
| P3 | Sentry + minimal PostHog analytics | merged |
| Phase 0 | Docs cleanup + single-source-of-truth + minimal CI | merged (PR #1 demo-stack + PR #2 docs/CI) |
| P4 | Dark theme (respecting Aurora) | pending |
| P5 | Basic integration tests (friends-flow, plan lifecycle, invitations, WS) | pending — CI now ready to host them |
| P6 | Mobile native check + EAS build (dev + preview) | pending |
| P7 | Push notifications (`plan_invite`, `friend_request`, `plan_finalized`) | pending — only meaningful after P6 |
| P8 | ESLint (WS lifecycle/participant backfill + `PATCH /users/me` already shipped) | pending |

---

## 3. What was delivered in the demo-stack + Phase-0 pair (PR #1 + PR #2)

Context: the user tested the app on a real iPhone 16 Pro Max (iOS 26.4) via
Expo Go tunnel. The session surfaced several real bugs that blocked the
end-to-end demo. PR #1 fixed them; PR #2 aligned the documentation with
reality and added minimal CI so those fixes (and anything downstream) are
protected by automated gates.

### Backend
- `backend/src/routes/ws.ts`: UUID validation for `plan:{id}` subscribes +
  `try/catch` around the WS message handler. Prevents a crash from a
  malformed subscribe (e.g. `plan:undefined`), which previously took the
  process down and returned HTTP 502 from the tunnel.
- `backend/src/db/migrate.ts`: adds
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id text`.
  The column was referenced in code but never created in `001_init.sql`,
  so on a fresh DB every `POST /plans/:id/messages` 500'd.
- `backend/src/tests/e2e-smoke.ts` and `rt2-smoke.ts`: now use random
  per-run phone numbers so they can run against a seeded DB without
  colliding with the pre-wired friendships between the seed users.
  `e2e-smoke` Section 13 ("finalize validation") was updated to match the
  backend's actual response (`INVALID_STATE` with a "confirmed place/time"
  message, not the outdated `INVALID_INPUT` / "at least one proposal").

### Frontend
- `fest-app/App.tsx`: wraps the root in `SafeAreaProvider` from
  `react-native-safe-area-context`. Without the provider, `useSafeAreaInsets()`
  returned zeros and iOS content ran under the Dynamic Island.
- `fest-app/src/components/ScreenContainer.tsx`: applies `paddingTop: insets.top`
  on native so every screen respects the iOS notch / Dynamic Island.
- `fest-app/src/screens/AuthScreen.tsx`: adds `lineHeight: 34` +
  `paddingVertical: theme.spacing.lg` to the OTP input. The field inherited
  `lineHeight: 24` from `h3` typography, which iOS `TextInput` clips when
  it is smaller than `fontSize`.
- `fest-app/src/screens/PlanDetailsScreen.tsx`: wraps `ListEmptyComponent`
  in a `scaleY: -1` `View` so the "Нет сообщений" empty state is no longer
  rendered upside-down inside the inverted `FlatList`.
- `fest-app/src/api/plans.ts`: `fetchPlan` and `createPlan` now unwrap
  `{ plan }` from the response. The backend always returns the plan in
  that envelope; the store was reading `result.id`, which was `undefined`,
  which in turn caused the frontend to navigate to `PlanDetails({ planId: undefined })`
  and trigger the WS crash above.
- `fest-app/src/stores/plansStore.ts`: `apiCreatePlan` clears `error: null`
  at the start of each call so a stale error from a previous operation
  doesn't bleed into the new flow's UI banner.
- `fest-app/package.json` + `package-lock.json` + `app.json`:
  `npx expo install --fix` to align native modules with Expo SDK 54. Most
  notably, `react-native-reanimated` went from 3.16.x to 4.1.2, and the
  new `react-native-worklets` peer was added. Without this, scanning the
  QR in Expo Go under SDK 54 hard-crashes with
  `[runtime not ready]: Exception in HostFunction: <unknown>` at
  `NativeReanimated` init.

### Docs
- `docs/DEMO_SETUP.md` (new) — full runbook: Postgres in docker → backend
  on `:3001` → cloudflared public tunnel → Expo Go tunnel with
  `EXPO_PUBLIC_*` envs baked in → QR → smoke checklist → troubleshooting →
  ASCII topology diagram.
- `docs/CURRENT_STATUS.md` — rewritten to reflect the actually-shipped
  state of master + this PR.
- `docs/HANDOFF.md` — this file, restructured around the current roadmap.
- `README.md` — quick-start updated, Linux/macOS section added, links to
  DEMO_SETUP and CI.

### CI (new)
- `.github/workflows/ci.yml` — four jobs, each on `pull_request` and
  `push: master`:
  - `backend typecheck` (`npx tsc --noEmit` in `backend/`)
  - `frontend typecheck` (`npx tsc --noEmit` in `fest-app/`)
  - `backend e2e smoke` — Postgres 17 service, migrate, seed, start
    backend, wait for `/api/health`, run `backend/src/tests/e2e-smoke.ts`
  - `backend realtime smoke` — same setup, runs `backend/src/tests/rt2-smoke.ts`

All four are now the merge gate.

---

## 4. Gotchas found during this session (read before restarting env)

1. **Expo SDK 54 native module alignment.** If you update any
   `react-native-*` package, always follow with
   `npx expo install --fix -- --legacy-peer-deps` so Metro's bundle matches
   the native binaries baked into Expo Go. The Reanimated 3 → 4 jump is
   especially sensitive because Reanimated 4 requires
   `react-native-worklets`.
2. **WS subscribe must never receive non-UUID channel ids.** The backend
   now defensively validates, but the root cause was a frontend bug
   (creating a plan returned `undefined`, which was then passed as a
   subscribe target). If you add new `apiCreate*`-style helpers that the
   UI navigates into, verify they unwrap the response envelope before
   returning.
3. **`messages.client_message_id` migration path.** Any future DB column
   added in code must be added to `backend/src/db/migrate.ts` (idempotent
   `ALTER TABLE … IF NOT EXISTS`). `contracts/mvp/db/001_init.sql` is only
   applied once at init; subsequent columns must go through `migrate.ts`.
4. **Demo stack is ephemeral.** The cloudflared (`trycloudflare.com`) and
   Expo tunnel (`exp.direct`) URLs die on VM restart. `DEMO_SETUP.md`
   explains how to stand them up again and how to bake the new backend URL
   into the Expo bundle via `EXPO_PUBLIC_*` envs **before** Metro starts.
5. **Rate limits in smoke tests.** `POST /auth/otp/send` is capped at 3/min
   per IP. The smoke scripts use random per-run phones, but running them
   twice in a row locally still hits the limit; CI is fine because each job
   runs on a fresh runner IP.
6. **Fastify 400 on bodyless POSTs.** `fest-app/src/api/client.ts` must NOT
   set `Content-Type: application/json` when `body === undefined`. Fastify
   rejects any declared-JSON request with an empty body (e.g.
   `POST /api/plans/by-token/:token/join`). This fix already lives on
   master — don't revert it.

---

## 5. Environment / seed data reference

- Postgres — docker container `fest-pg` (`postgres:17`), database `plans`,
  credentials `postgres:postgres`, port `5432`.
- Backend — default `:3001`. Required envs: `DATABASE_URL`, `JWT_SECRET`
  (>=32 chars in production), optional `OTP_CODE` (defaults to `1111`),
  optional `SENTRY_DSN`, optional `POSTHOG_API_KEY`.
- Expo — default Metro `:8081`. For device testing use `npx expo start --tunnel --go`
  with `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_WS_BASE_URL` in the same
  shell **before** starting Metro.
- OTP — code is always `1111` (`OTP_MOCK`), no real SMS provider (P0b deferred).

Seed users for manual demo testing (from `backend/src/db/seed.ts`):

| Phone | Name |
|-------|------|
| `+79990000000` | "Я" — creator of plan "Кино в субботу" |
| `+79991111111` | "Маша" |
| `+79994444444` | "Артём" |
| `+79992222222` | "Дима" |
| `+79993333333` | "Лена" |
| `+79995555555` | "Катя" |

Share-token for a deep-link smoke: plan
`72222222-2222-4222-8222-222222222222` has `share_token=bcf69309791cf210`,
deep link `fest://p/bcf69309791cf210`.

---

## 6. How to resume (concrete next steps for the next agent)

1. Check out a fresh master: `git fetch && git checkout master && git pull`.
   CI on master is already running and green (see
   <https://github.com/magtophard-ai/Plans/actions>).
2. Pick a roadmap item. The two easiest unblocked candidates are:
   - **P4 dark theme** — UI-only, no schema/API work; constrained to the
     Aurora palette.
   - **P5 integration tests** — now cheap because CI already runs Postgres +
     migrate + seed. Extend `backend/src/tests/*-smoke.ts` with additional
     flows instead of inventing a new test framework.
3. Run both typechecks (`cd backend && npx tsc --noEmit`,
   `cd fest-app && npx tsc --noEmit`) locally before opening a PR. The CI
   workflow will re-run the same commands plus the two smoke jobs.
4. Open PRs against master — CI will block the merge if the smoke tests
   regress.

---

## 7. Stuff the user did NOT ask for (do not do unless asked)

- Do not set up a real SMS provider (P0b is explicitly deferred).
- Do not bypass `AGENTS.md` / `CLAUDE.md` conventions.
- Do not force-push to master or amend commits.
- Do not create new motion components; reuse the existing ones in
  `fest-app/src/motion/`.
- Do not start the dark theme (P4) or EAS builds (P6) unprompted.
