# Session Handoff

This document is the forward-looking handoff: **what is next, which
branches/PRs are in flight, and the gotchas you will hit on a fresh clone**.
For "what is shipped today", read [`docs/CURRENT_STATUS.md`](./CURRENT_STATUS.md).
For a step-by-step runbook to stand the demo stack up for real-device testing
through Expo Go, read [`docs/DEMO_SETUP.md`](./DEMO_SETUP.md).

Historical narrative (demo-stack fixes, Phase-0 docs/CI, etc.) lives further
down the file; the top section is the most recent checkpoint.

---

## Checkpoint — Spring canonical backend

Spring Boot in `backend-spring/` is now the current canonical backend. Fastify remains in `backend/` as archived legacy code for history, rollback drills, and legacy parity audits only. New backend changes, runbooks, smoke tests, and content ops work should target Spring.

Use `docs/SPRING_SWITCHOVER.md` for the canonical backend runbook and `docs/SPRING_MIGRATION_STATUS.md` for the migration/archive note.

### Canonical backend commands

```bash
cd backend-spring
PORT=3001 ./gradlew bootRun
./gradlew test
./gradlew coreSmokeTest
./gradlew realtimeSmokeTest
./gradlew contentOpsSmokeTest
./gradlew fullSpringSmokeTest
```

Frontend env for local Spring:

```bash
export EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api
export EXPO_PUBLIC_WS_BASE_URL=ws://localhost:3001/api/ws
```

For tunnels/mobile use `EXPO_PUBLIC_API_BASE_URL=https://<backend-host>/api` and `EXPO_PUBLIC_WS_BASE_URL=wss://<backend-host>/api/ws`.

---

## Previous checkpoint — after Content Ops v1

Content Ops / Real Events Pipeline v1 is implemented and merged into
`master`. This is a historical repo checkpoint, not a new feature scope: the next agent
should treat CLI-only content ops as shipped infrastructure and should avoid
starting parser bots, admin UI, or venue self-serve before an operator trial.

### Current state

- **Core planning / beta hardening is complete**: the 4-slice MVP is
  API-backed, realtime is push-only via WS, per-operation errors,
  offline/reconnect UX, pagination, observability, and CI gates are shipped.
- **Content Ops v1 exists**: internal operators can import normalized JSON into
  `event_ingestions`, publish to `events`, update already-published events, and
  cancel events.
- **Public app remains mobile-first and plan-centric**: discovery feeds lead
  into event details and plan creation; there is no user-facing event creation,
  admin UI, or venue self-serve.
- **Public feed filtering**: `/api/events`, `/api/search/events`, and
  `/api/venues/:id/events` only return `events.status='published'`.
- **Cancelled event behavior**: cancelled events are hidden from feed/search/
  venue lists, but `GET /api/events/:id` and linked-plan event payloads remain
  readable so notifications and existing plans do not turn into 404s.

### Content Ops v1 summary

- CLI-only; no frontend/admin UI and no internal HTTP endpoints.
- Input is manually prepared normalized JSON. `source_url` is metadata only:
  no backend fetch, scrape, parse, Telegram/VK/Instagram bot, or arbitrary URL
  processing exists in v1.
- `event_ingestions` stores the internal operator queue and raw normalized
  payload; `events` only receives rows after explicit publish.
- Duplicate handling is conservative:
  - exact `(source_type, source_event_key)` updates the same public event;
  - fingerprint matches without a source key become `duplicate` candidates;
  - legacy/seed events without `source_fingerprint` are checked by normalized
    title + venue name/address + `starts_at`;
  - duplicate candidates require explicit `--force-link-event-id`.
- `ops:sync` is update-only: it updates already-published/linked events and
  does not create a new public `events` row before explicit `ops:publish`.
- Existing notification types are reused: `event_time_changed` and
  `event_cancelled`. No new notification types were added.

### Content Ops commands

Run from `backend-spring/` with Spring's CLI runner after backend env setup.

```bash
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="import --file ../docs/examples/content-ops-event.example.json"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="list --state imported|duplicate|published|cancelled"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="publish --ingestion-id <id> [--venue-id <id>] [--force-link-event-id <id>]"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="sync --file <json>"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="update --ingestion-id <id>"
SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="cancel --event-id <id> --reason '...'"
```

`ops:content` is the shared entrypoint behind the convenience scripts; supported
commands are `import`, `list`, `show`, `publish`, `update`, `sync`, `cancel`.

Safe synthetic payload example:
[`docs/examples/content-ops-event.example.json`](./examples/content-ops-event.example.json).

### Operator flow

1. Prepare one normalized JSON payload per event. Keep it synthetic/manual in
   v1; do not add parser bots or network fetches.
2. Import: `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="import --file path/to/event.json"`.
3. Inspect queue with `list --state imported` (or `duplicate`, `published`, `cancelled`). Use `show --ingestion-id <id>` for one ingestion.
4. Publish after operator verification with `publish --ingestion-id <id> [--venue-id <id>]`.
5. Sync updates later with `sync --file path/to/event.json`. Before publish, `sync` reports skipped/error and does **not** create a public event.
6. Cancel with `cancel --event-id <id> --reason "..."`.

Operator gotchas:

- `source_url` is metadata only, no fetch/parse.
- Fingerprint duplicate without a source key requires explicit
  `--force-link-event-id`.
- If `--venue-id` is omitted, Content Ops reuses an exact name+address venue
  match; otherwise it may auto-create a venue with `lat=0/lng=0`. Prefer an
  existing `--venue-id` when coordinates matter.

### Known limitations

- Real SMS OTP is still absent; `OTP_CODE=1111` remains the dev/mock path.
- Push notifications are still absent; only in-app + WS notifications exist.
- Native offline detection remains limited to WS reconnect status + recent
  network errors; browser `online/offline` is web-only.
- Parser bots/scraping are not implemented.
- Venue self-serve is not implemented.
- Full admin UI is not implemented.
- Map mode is not a priority.
- Monetization must not be started.
- Content Ops is manual/operator-only.
- Venues auto-created through Content Ops may have `lat/lng = 0`.
- No fuzzy auto-merge without explicit operator confirmation.

### Next recommended task: Manual Content Seeding Sprint / Operator Trial

Do not jump straight to parser bots, admin platform, or venue portal. The next
useful step is an operator trial:

1. Pick 10–20 real events.
2. Manually prepare normalized JSON payloads.
3. Run import → list/show → publish → sync/update → cancel where applicable.
4. Record what fields, validation, commands, or docs are missing for a human
   operator.
5. Only after that trial decide whether a small internal UI or parser/bot work
   is justified.

---

## Previous checkpoint — 2026-04-25 (historical, before Content Ops v1)

The repo just finished a beta-hardening cycle and is about to pivot from
core planning work to content/events supply. Anything below is what a
fresh owner (or forked copy) should know before picking up the next task.

### Current product state

- **Product**: "Планы?" / Fest&Rest — mobile-first social event discovery
  and planning. Core loop: _discover event → save/interest → create a
  shared plan → discuss+propose+vote inside the plan → finalize
  place/time → attend → later repeat with the same people_.
- **Main screens**: Home (event feed), Event Details, Venue Details,
  Create Plan, Plans Hub (my plans + invitations + groups), Plan Details
  (overview / proposals / chat / participants), Notifications, Profile,
  Public Profile, Auth, Onboarding, plus the `PlanShareLinkLanding`
  screen for `fest://p/:token` deep links.
- **MVP scope (frozen)**: 4 slices (REST read + minimal writes → plan
  lifecycle + participants + invitations + groups + notifications →
  proposals + voting + finalize + repeat + messages → WS realtime) are
  all shipped and API-backed. Onboarding, empty states, observability,
  CI, per-op errors, offline/reconnect UX, feed + chat pagination, and
  `friend_accepted` notifications are layered on top.
- **Not in near-term scope**: map mode, real SMS OTP, push notifications,
  venue self-serve / admin, monetization, web-only responsive redesign,
  group chat, calendar entity, email auth, event creation UI, dark theme.
- **Content Ops v1**: real-event supply is internal CLI-only. Operators
  provide normalized JSON; no scraping/parsers, public admin UI, or venue
  self-serve. The workflow is import into `event_ingestions`, publish/update
  `events`, or cancel existing events.

### Current technical state

- **Frontend**: Expo SDK 54 + React Native + TypeScript, Zustand (7 stores),
  React Navigation 7 (RootStack → MainTabs → HomeStack / PlansStack).
  `ScreenContainer` wraps every screen (`maxWidth: 600` on web, safe-area
  on native). `theme.spacing` is Platform-adapted — never hardcode padding.
- **Backend**: Spring Boot + Java 21 + PostgreSQL 17 is canonical in `backend-spring/`. Fastify + TypeScript remains archived in `backend/` for history and rollback drills only.
- **DB**: Spring owns new schema work through Flyway migrations in `backend-spring/src/main/resources/db/migration`. `contracts/mvp/db/001_init.sql` remains the baseline contract reference.
- **Auth**: phone + OTP. `OTP_CODE` env (defaults to `1111`) is accepted
  for any phone. JWT access token, no refresh rotation in MVP. No real
  SMS provider.
- **Realtime**: single WS endpoint `ws://<host>/api/ws`, JWT auth on
  connect, `subscribe`/`unsubscribe` messages per channel (`user:{userId}`,
  `plan:{planId}`). 11 emitted events (see `CURRENT_STATUS.md`). REST
  remains the only source of truth; WS is push-only.
- **Notifications**: all server-created (no client insert path). Spring writes notification rows and emits `notification.created` on the recipient's `user:{id}` channel. Adding a new type requires the backend enum/migration path plus the frontend constants (`TYPE_LABELS`, `TYPE_ICONS`, `TYPE_ACCENT`, `PLAN_TYPES` if applicable).
- **Per-op errors**: `plansStore.operationErrors: Partial<Record<PlanOp, string>>`
  (15 ops). No shared global error. `operationErrors.sendMessage`
  auto-clears on connectivity recovery (subscription inside
  `ConnectivityBanner.tsx`). Optimistic updates (vote, interest/save)
  remain immutable-rollback.
- **Offline / reconnect**: `connectivityStore` aggregates browser `online`,
  `wsStatus` (from `api/ws.ts`), and recent network errors. One
  `ConnectivityBanner` at the app root renders red "Нет соединения"
  (offline) and amber "Восстанавливаем соединение…" (WS reconnecting).
  `api/client.ts` short-circuits mutations with `code: 'OFFLINE'` when
  the browser reports offline.
- **Pagination**: feed is `onEndReached` + footer (disabled when a
  category filter is active — client-side filter, paginated server-side
  result set); chat is `?before=<created_at>` cursor + id-based dedup,
  loading older messages when the user scrolls to the top of the
  inverted `FlatList`.
- **Tests / CI**: Spring canonical gates are `./gradlew test`, `coreSmokeTest`, `realtimeSmokeTest`, `contentOpsSmokeTest`, and `fullSpringSmokeTest` in `backend-spring/`. Frontend typecheck remains `cd fest-app && npx tsc --noEmit`. Legacy Fastify CI jobs stay as archived rollback checks only.

### Recently merged work (latest PRs on top)

These are the four PRs that landed since the demo-stack + Phase-0 pair
(the history before that is preserved further down in this file):

- **PR #4** — `plans: auto-clear inline sendMessage error on connectivity recovery`.
  Subscribe to `connectivityStore` inside the existing one-time IIFE in
  `ConnectivityBanner.tsx` and call `plansStore.clearOpError('sendMessage')`
  on `online: false → true` or `wsStatus: 'reconnecting' → 'connected'`.
  Single-file additive fix. Scope deliberately narrow (sendMessage only).
- **PR #3** — `Beta Hardening Sprint #1: per-op errors, offline/reconnect UX, pagination`.
  Replaced the single `plansStore.error` with `operationErrors: Record<PlanOp, string>`
  (15 ops). Introduced `connectivityStore` + `ConnectivityBanner` +
  offline short-circuit in `api/client.ts`. Wired Home feed
  infinite-scroll and Plan chat load-older.
- **PR #2** — `Friends + Notifications hardening: friend_accepted + typed NOTIFICATION_TYPES`.
  Added `friend_accepted` notification type end-to-end (backend insert on
  `PATCH /users/friends/:id?action=accept`, frontend
  `NotificationType` + rendering). Introduced typed
  `NOTIFICATION_TYPES` const as the single source of truth; the enum
  migration in `backend/src/db/migrate.ts` is now derived from it.
- **PR #1** — `Reality alignment: docs + OpenAPI + frontend types sync`.
  Brought `notification_type` enum to 11 across 5 sources, documented
  plan-share endpoints (`GET /plans/by-token/:token`, `POST
  /plans/by-token/:token/join`, `PATCH /users/friends/:id`,
  `GET /users/search`) in OpenAPI + backend-contract + screen mapping,
  and fixed OTP drift (`OTP_MOCK` → `OTP_CODE`, `{"ok":true}` → `{}`) in
  docs.

### Known limitations (carry-over into next owner's session)

- **No real SMS OTP** — `OTP_CODE=1111` is the only accepted code. A
  production SMS integration (P0b) is explicitly deferred.
- **No push notifications** — in-app + WS only. Meaningful only after an
  EAS dev client ships (P6/P7).
- **Native offline detection is limited** — the browser `online/offline`
  listeners are web-only; on native, only the WS reconnect status + the
  "recent network error" signal fire `ConnectivityBanner`. NetInfo-based
  native flip is intentionally out of scope for the hardening sprint.
- **At this historical checkpoint, content supply was seed-only** — events and
  venues came from `backend/src/db/seed.ts`. Content Ops v1 has since shipped;
  keep this section only as pre-Content-Ops context.
- **No venue self-serve** — venues are also seed-only. Admin platform
  is out of scope; the next task (see below) assumes an internal
  workflow, not a public portal.
- **Map mode is not a priority** — location is text + coordinates only;
  no map view.
- **Monetization is not started and must not be.**
- **CI for fork/bot PRs may require manual approval** in the "Approve and
  run workflows" flow on GitHub. Devin Review usually runs regardless;
  GitHub Actions jobs sometimes don't spawn until approved.
- **Home feed pagination is disabled when a category filter is active**
  (documented compromise from the Beta Hardening sprint; category filter
  is client-side over the paginated result set). Fine for 6 seeded
  events, will need a small backend-side filter push when real events
  land.
- **Notification WS/REST shape mismatch** — WS payloads are snake_case
  while REST is camelized by `api/client.ts`. Not a functional bug; not
  worth fixing before Content Ops unless a new notification type
  surfaces the issue.

### Historical next task: Content Ops / Real Events Pipeline v1 (now shipped)

The app is close to closed-beta readiness on product/core-loop, but the
main blocker is no longer planning — it is **real events**. Tools and
UX exist; the seed is 6 synthetic events; there is no way to get real
concerts / standup / exhibitions into the feed without editing
`seed.ts`.

Scope now shipped for v1 (intentionally internal, not a self-serve product):

- A small **internal workflow** for normalized JSON, not parser bots:
  `event_ingestions` → publish/update/cancel `events`.
- Event shape extensions (`status`, source metadata, cancellation fields)
  added only through `backend/src/db/migrate.ts`; `001_init.sql` is left as
  the initial schema.
- A minimal CLI operator surface (`npm run ops:import/list/publish/update/sync/cancel`)
  for the internal team. No HTTP admin endpoint and no frontend screen.
- Hooks for **update / cancel** propagation use existing notifications:
  `event_time_changed` and `event_cancelled`.
- Duplicate protection is conservative: exact source key updates the same
  event, fingerprint candidates require `--force-link-event-id`.
- No venue self-serve, no public admin panel, no map, no monetization.
  This is strictly about feeding real data into the existing feed so
  closed beta has something to plan around.

---

## TL;DR (legacy — pre-checkpoint)

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

### CI (historical)
- The pre-Spring workflow had four Fastify/frontend jobs on `pull_request` and `push: master`:
  - legacy Fastify typecheck (`npx tsc --noEmit` in `backend/`)
  - frontend typecheck (`npx tsc --noEmit` in `fest-app/`)
  - legacy Fastify e2e smoke — Postgres 17 service, migrate, seed, start archived backend, wait for `/api/health`, run `backend/src/tests/e2e-smoke.ts`
  - legacy Fastify realtime smoke — same setup, runs `backend/src/tests/rt2-smoke.ts`

Current CI is documented at the top of this file and in `docs/CURRENT_STATUS.md`; Spring Gradle gates are now canonical.

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
3. **`messages.client_message_id` migration path.** Any future DB column added in code must be added through Spring Flyway migrations under `backend-spring/src/main/resources/db/migration`. `contracts/mvp/db/001_init.sql` remains the baseline contract reference.
4. **Demo stack is ephemeral.** The cloudflared (`trycloudflare.com`) and
   Expo tunnel (`exp.direct`) URLs die on VM restart. `DEMO_SETUP.md`
   explains how to stand them up again and how to bake the new backend URL
   into the Expo bundle via `EXPO_PUBLIC_*` envs **before** Metro starts.
5. **Rate limits in smoke tests.** `POST /auth/otp/send` is capped at 3/min
   per IP. The smoke scripts use random per-run phones, but running them
   twice in a row locally still hits the limit; CI is fine because each job
   runs on a fresh runner IP.
6. **Legacy Fastify 400 on bodyless POSTs.** `fest-app/src/api/client.ts` must NOT set `Content-Type: application/json` when `body === undefined`. The archived Fastify implementation rejects any declared-JSON request with an empty body (e.g. `POST /api/plans/by-token/:token/join`). This fix already lives on master — don't revert it.

---

## 5. Environment / seed data reference

- Postgres — docker container `fest-pg` (`postgres:17`), database `plans`,
  credentials `postgres:postgres`, port `5432`.
- Backend — canonical Spring defaults to `:3001`. Required envs: `DATABASE_URL`, `JWT_SECRET` (>=32 chars in production), optional `OTP_CODE` (defaults to `1111`), optional `SENTRY_DSN`, optional `POSTHOG_API_KEY`.
- Expo — default Metro `:8081`. For device testing use `npx expo start --tunnel --go` with `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_WS_BASE_URL` in the same shell **before** starting Metro.
- OTP — code is always `1111` (controlled by the `OTP_CODE` env var). No real SMS provider (P0b deferred). `POST /auth/otp/send` returns an empty body `{}` on success (HTTP 200), not `{ok:true}`.

Seed users for manual demo testing (from `backend-spring/src/main/resources/db/seed/R__dev_seed.sql`):

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
   <https://github.com/Ax1123B/Plans/actions>).
2. Pick a roadmap item. The two easiest unblocked candidates are:
   - **P4 dark theme** — UI-only, no schema/API work; constrained to the
     Aurora palette.
   - **P5 integration tests** — now cheap because CI already runs Spring Gradle smoke suites with Postgres/Testcontainers. Extend Spring smoke coverage instead of inventing a new test framework.
3. Run Spring checks (`cd backend-spring && ./gradlew test` plus relevant smoke tasks) and frontend typecheck (`cd fest-app && npx tsc --noEmit`) locally before opening a PR. The CI workflow will re-run the same active gates plus legacy Fastify archive checks.
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
