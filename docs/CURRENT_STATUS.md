# FEST MVP — Current Status

**Last updated**: 2026-04-27
**Single source of truth**: this document for **what is shipped and how it runs today**.
For a narrative of the most recent merges + next recommended task, see the
Checkpoint section at the top of [`docs/HANDOFF.md`](./HANDOFF.md) (that
file also carries the forward-looking roadmap, gotchas, and next-agent
handoff). For a step-by-step runbook to stand the demo stack up for
real-device testing, see [`docs/DEMO_SETUP.md`](./DEMO_SETUP.md).

## TL;DR

- Spring Boot in `backend-spring/` is the current canonical backend for active development, runbooks, and new backend changes.
- Fastify in `backend/` is archived legacy code for history, rollback drills, and legacy parity audits only.
- 4-slice MVP is complete and API-backed; all 7 Zustand stores are wired to
  the backend.
- Demo stack runs end-to-end through Expo Go/Web validation paths with Spring on port `3001`; use `EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api` and derived or explicit `EXPO_PUBLIC_WS_BASE_URL=ws://localhost:3001/api/ws`.
- Observability (Sentry + PostHog) is shipped on both backend and frontend.
- CI (GitHub Actions) gates every PR on Spring Gradle tests/smokes, frontend typecheck, and archived legacy Fastify checks. See
  [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
- Content Ops v1 is shipped as an internal CLI-only workflow for normalized
  JSON import/publish/update/cancel; see
  [`backend-spring/README.md`](../backend-spring/README.md#spring-content-ops-smoke).

## Implementation status

| Slice | Scope | Status |
|-------|-------|--------|
| 1 | REST read-only + minimal writes (auth, events, venues, search, interest/save) | Done on Spring |
| 2 | Plan lifecycle, participants, invitations, groups, notifications | Done on Spring |
| 3 | Proposals, voting, finalize/unfinalize, repeat, messages | Done on Spring |
| 4 | WebSocket real-time (messages, proposals, votes, lifecycle, notifications) | Done on Spring |
| Content Ops | Internal CLI import/list/show/publish/update/sync/cancel | Done on Spring |

## Feature status (API / mock / dev-only)

| Feature | Status |
|---------|--------|
| Auth (OTP) | **Mock** — code is always `1111`, no SMS sent (P0b explicitly deferred) |
| Events | API-backed public feed plus internal CLI Content Ops v1 for normalized real-event import/publish/update/cancel |
| Venues | Seed-only, read-only from API |
| Plans | Full CRUD + lifecycle, all API-backed |
| Proposals + votes | Full API-backed |
| Messages | Full API-backed, with `client_message_id` dedup |
| Invitations | Full API-backed (atomic accept with 15-participant `FOR UPDATE` lock) |
| Groups | Full API-backed (list/detail/member reads) |
| Notifications | Full API-backed, server-created only |
| Friends | Full API-backed; pending → accepted flow with `friend_request` (to addressee) and `friend_accepted` (to requester) notifications |
| Plan share / deep link | Share token + public preview + authed join + `fest://p/:token` linking |
| WebSocket | Real — push-only, REST is source of truth; UUID-validated subscribes; wrapped handler (does not crash on malformed subscribe) |
| Onboarding | 3-slide flow before `AuthScreen`, persisted via AsyncStorage |
| Empty states | Upgraded `EmptyState` + contextual copy across ~10 call sites |
| Observability | Sentry (error reporting, both sides) + PostHog analytics (both sides) |
| Per-operation errors | `plansStore.operationErrors` keyed by `PlanOp` (15 ops) — `create`, `sendMessage`, `vote`, `finalize`, etc. fail independently. Stale `sendMessage` error auto-clears on connectivity recovery (`online: false → true` or WS `reconnecting → connected`). |
| Connectivity UX | Top `ConnectivityBanner` aggregates browser `online`, WS `wsStatus`, and recent network errors into red (offline) / amber (reconnecting) strips. `api/client.ts` short-circuits mutations with `code: 'OFFLINE'` when offline. |
| Pagination | Home feed `onEndReached` + footer (disabled when a category filter is active, by design); PlanDetails chat loads older messages via `?before=` cursor with id-based dedup. |
| Content Ops | CLI-only internal workflow: normalized JSON → `event_ingestions` → publish/update/cancel `events`; no public admin UI, no venue self-serve, no scraping/parsers. Public event lists show only `published`; cancelled details remain readable by id. |

## Realtime

- **Connection**: `ws://<host>/api/ws` locally, `wss://<backend-host>/api/ws` for HTTPS tunnels/mobile — JWT auth on connect, heartbeat (ping/pong).
- **Channels**: `user:{userId}`, `plan:{planId}`.
- **Events emitted (11)** on `plan:{id}`: `plan.message.created`,
  `plan.proposal.created`, `plan.vote.changed`, `plan.finalized`,
  `plan.unfinalized`, `plan.cancelled`, `plan.completed`,
  `plan.participant.added`, `plan.participant.updated`,
  `plan.participant.removed`; on `user:{id}`: `notification.created`.
- **Frontend handling**: messages / proposals / votes merge in-place;
  lifecycle and participant events trigger `fetchPlan` to resync state
  across participants (`fest-app/src/api/wsHandler.ts`).
- **Reconnect**: exponential backoff + resubscribe + data resync.
- **Dedup**: `client_message_id` for messages, ID check for proposals,
  optimistic vote filtering.
- **Subscribe hardening**: the backend validates UUIDs for `plan:{id}`
  channels and wraps the WS message handler in try/catch so a malformed
  client subscribe (e.g. `plan:undefined`) can no longer crash the process.

## How to run

For phone testing via Expo Go, follow
[`docs/DEMO_SETUP.md`](./DEMO_SETUP.md) end-to-end. That is the only
documented path for real-device testing.

Quick local (web) start:
1. Postgres — `docker run -d --name fest-pg -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=plans postgres:17`.
2. Backend — `cd backend-spring && PORT=3001 ./gradlew bootRun`.
3. Optional seed reload — `psql postgres://postgres:postgres@localhost:5432/plans -f backend-spring/src/main/resources/db/seed/R__dev_seed.sql`.
4. Frontend — `cd fest-app && EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api EXPO_PUBLIC_WS_BASE_URL=ws://localhost:3001/api/ws npx expo start --web`.
5. Auth — phone `+79990000000`, code `1111`.

For tunnels/mobile, set:

```bash
export EXPO_PUBLIC_API_BASE_URL=https://<backend-host>/api
export EXPO_PUBLIC_WS_BASE_URL=wss://<backend-host>/api/ws
```

## Known limitations

- No real SMS — OTP is always `1111`.
- No push notifications — in-app + WS only (P7, meaningful only after EAS Dev Client).
- No map view.
- No email auth.
- No group chat — chat is plan-level only.
- No user-facing event creation form. Internal content ops is CLI-only from normalized JSON; no parser bots, public admin UI, or venue self-serve.
- Content ops remains manual/operator-only; venues created without `--venue-id`
  may have `lat/lng=0`.
- No fuzzy auto-merge without explicit operator confirmation.
- Max 15 participants per plan.
- `fest-app/src/fest-animations/**` intentionally excluded from the main
  frontend TypeScript gate (`fest-app/tsconfig.json`). Validate separately
  with `tsconfig.fest-animations.json` when needed.
- Home feed pagination is disabled when a category filter is active (the
  backend paginates on the unfiltered result set; filtering happens
  client-side). Documented compromise from the Beta Hardening sprint; fine
  for MVP seed of 6 events.
- Native online detection is limited to WS reconnect status + recent
  network errors; the browser `online/offline` listeners are web-only.
  NetInfo-based native flip is intentionally deferred.
- Notification shape mismatch between WS and REST payloads (WS is
  snake_case, REST is camelized) — not a functional bug, documented for
  next hardening pass.
- `authStore.logout` clears the token locally only — no server-side JWT
  invalidation.

## Dev/mock-only items intentionally kept

- `OTP_CODE=1111` — mock OTP, kept until a real SMS integration ships (P0b).
- Cloudflared + Expo tunnel in `docs/DEMO_SETUP.md` are ephemeral by
  design; restarts produce new URLs.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `master`:
- `spring test` — `cd backend-spring && ./gradlew test`.
- `spring core smoke` — `cd backend-spring && ./gradlew coreSmokeTest`.
- `spring realtime smoke` — `cd backend-spring && ./gradlew realtimeSmokeTest`.
- `spring content ops smoke` — `cd backend-spring && ./gradlew contentOpsSmokeTest`.
- `spring full network smoke` — `cd backend-spring && ./gradlew fullSpringSmokeTest`.
- `frontend typecheck` — `cd fest-app && npx tsc --noEmit`.
- `legacy Fastify typecheck/e2e/realtime/content ops smoke` — retained only as archived legacy rollback checks.

Spring jobs and frontend typecheck are the active path for new backend/frontend work. Legacy Fastify jobs should stay green while the archive remains in the repo, but new backend changes should not target Fastify.
