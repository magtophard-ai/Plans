# FEST MVP — Current Status

**Last updated**: 2026-04-25
**Single source of truth**: this document for **what is shipped and how it runs today**.
For a narrative of the most recent merges + next recommended task, see the
Checkpoint section at the top of [`docs/HANDOFF.md`](./HANDOFF.md) (that
file also carries the forward-looking roadmap, gotchas, and next-agent
handoff). For a step-by-step runbook to stand the demo stack up for
real-device testing, see [`docs/DEMO_SETUP.md`](./DEMO_SETUP.md).

## TL;DR

- 4-slice MVP is complete and API-backed; all 7 Zustand stores are wired to
  the backend.
- Demo stack runs end-to-end on a real iPhone via Expo Go tunnel (SDK 54).
  iOS safe-area, OTP input, inverted-chat empty state, WS subscribe, plan
  creation, and the `messages.client_message_id` migration all work.
- Observability (Sentry + PostHog) is shipped on both backend and frontend.
- CI (GitHub Actions) gates every PR on backend + frontend typecheck, backend
  REST/HTTP smoke, realtime (WebSocket) smoke, and content-ops smoke. See
  [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Implementation status

| Slice | Scope | Status |
|-------|-------|--------|
| 1 | REST read-only + minimal writes (auth, events, venues, search, interest/save) | Done |
| 2 | Plan lifecycle, participants, invitations, groups, notifications | Done |
| 3 | Proposals, voting, finalize/unfinalize, repeat, messages | Done |
| 4 | WebSocket real-time (messages, proposals, votes, lifecycle, notifications) | Done |

## Feature status (API / mock / dev-only)

| Feature | Status |
|---------|--------|
| Auth (OTP) | **Mock** — code is always `1111`, no SMS sent (P0b explicitly deferred) |
| Events | API-backed public feed plus internal CLI Content Ops v1 for normalized real-event import/publish/update/cancel |
| Venues | Seed-only, read-only from API |
| Plans | Full CRUD + lifecycle, all API-backed |
| Proposals + votes | Full API-backed |
| Messages | Full API-backed, with `client_message_id` dedup (column is created by `backend/src/db/migrate.ts`) |
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

- **Connection**: `ws://<host>/api/ws` — JWT auth on connect, heartbeat (ping/pong).
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
1. Postgres — `docker run -d --name fest-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=plans postgres:17` (or Windows PG service — see [AGENTS.md](../AGENTS.md)).
2. Backend — `cd backend && npm install && npm run db:migrate && npm run db:seed && npm run start`.
3. Frontend — `cd fest-app && npm install --legacy-peer-deps && npx expo start --web`.
4. Auth — phone `+79990000000`, code `1111`.

## Known limitations

- No real SMS — OTP is always `1111`.
- No push notifications — in-app + WS only (P7, meaningful only after EAS Dev Client).
- No map view.
- No email auth.
- No group chat — chat is plan-level only.
- No user-facing event creation form. Internal content ops is CLI-only from normalized JSON; no parser bots or public admin UI.
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
- `backend typecheck` — `cd backend && npx tsc --noEmit`
- `frontend typecheck` — `cd fest-app && npx tsc --noEmit`
- `backend e2e smoke` — spins up Postgres 17 as a service, runs
  `npm run db:migrate && npm run db:seed`, starts the backend, waits for
  `/api/health`, then runs `backend/src/tests/e2e-smoke.ts`.
- `backend realtime smoke` — same setup, runs
  `backend/src/tests/rt2-smoke.ts`.
- `backend content ops smoke` — same setup, runs
  `backend/src/tests/content-ops-smoke.ts`.

All five jobs must be green to merge. They run in parallel with independent
Postgres instances.
