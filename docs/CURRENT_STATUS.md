# FEST MVP — Current Status

**Last updated**: 2026-04-22
**State**: Frozen MVP core + beta hardening pass + social/share polish (PR #1, PR #2 merged)

> 🧭 New agent? Read [`docs/HANDOFF.md`](./HANDOFF.md) first — it has the session
> journal, the agreed roadmap, open PRs, and the exact scope for the next piece
> of work (P2 = onboarding + empty states).

## Implementation status

| Slice | Scope | Status |
|-------|-------|--------|
| 1 | REST read-only + minimal writes (auth, events, venues, search, interest/save) | Done |
| 2 | Plan lifecycle, participants, invitations, groups, notifications | Done |
| 3 | Proposals, voting, finalize/unfinalize, repeat, messages | Done |
| 4 | WebSocket real-time (messages, proposals, votes, lifecycle, notifications) | Done |

All 4 slices implemented and integrated. All 7 stores are API-backed for active MVP flows.

## What is real API vs still mock-only

| Feature | Status |
|---------|--------|
| Auth (OTP) | Mock — code is always `1111`, no SMS sent |
| Events | Seed-only, read-only from API |
| Venues | Seed-only, read-only from API |
| Plans | Full CRUD + lifecycle, all API-backed |
| Proposals + votes | Full API-backed |
| Messages | Full API-backed |
| Invitations | Full API-backed (atomic accept with 15-participant lock) |
| Groups | Full API-backed (list/detail/member reads through backend) |
| Notifications | Full API-backed, server-created only |
| Friends | Full API-backed; **pending → accepted** flow (PR #1) with `friend_request` notifications and incoming-requests UI |
| Plan share / deep link | Share token + public preview + authed join + `plan_join_via_link` notification (PR #2); `fest://p/:token` linking |
| WebSocket | Real — push-only, REST is source of truth |

## Realtime support

- **Connection**: `ws://localhost:3001/api/ws` — JWT auth on connect
- **Channels**: `user:{userId}`, `plan:{planId}`
- **Events emitted**: `plan.message.created`, `plan.proposal.created`, `plan.vote.changed`, `plan.finalized`, `plan.unfinalized`, `notification.created`
- **Events NOT emitted**: `plan.cancelled`, `plan.completed`, participant add/remove/update
- **Reconnect**: exponential backoff + resubscribe + data resync
- **Dedup**: `client_message_id` for messages, ID check for proposals, optimistic vote filtering

## How to run

See `docs/RUNBOOK.md` for full instructions.

Quick start:
1. Backend: `E:\FEST\V1\backend\node_modules\.bin\tsx.cmd E:\FEST\V1\backend\src\index.ts` (workdir: `E:\FEST\V1\backend`)
2. Frontend: `npx expo start --web` (workdir: `E:\FEST\V1\fest-app`)
3. Auth: any phone + code `1111`

## Known limitations

- No real SMS — OTP always `1111`
- No push notifications — in-app + WS only
- No map view
- No email auth
- No group chat — chat is plan-level only
- No event creation form — events are seed-only
- No real-time updates for plan cancellation, completion, or participant changes
- Max 15 participants per plan
- Web-only tested for this release
- `fest-app/src/fest-animations/**` intentionally excluded from main frontend quality gate (`fest-app/tsconfig.json`)
- `fest-animations` typecheck is separate (`npx tsc --noEmit -p tsconfig.fest-animations.json`) and currently may fail
- `plansStore.error` is global — errors from different operations share one banner
- Notification shape mismatch: WS-pushed notifications use `user_id`/`created_at` (snake_case, matching type), REST-fetched ones get camelized to `userId`/`createdAt` (mismatching the declared `Notification` type)

## Dev/mock-only items intentionally kept

- `OTP_CODE=1111` — mock OTP, required until real SMS integration
- `authStore.logout` clears token locally only — no server-side token invalidation
- ProfileScreen `handleSaveProfile` is a no-op (no `PATCH /users/me` call wired up yet)
- `fetchUser` API function exists but is unused by any screen
- `addFriend`/`removeFriend` API functions exist but are unused by any screen

## Beta hardening updates

- Main quality gate stabilized: backend `npx tsc --noEmit` and frontend `npx tsc --noEmit` (main app scope) are independent from `fest-animations`
- Seed stabilized for repeat dev runs: deterministic IDs + upserts (no new duplicate seed entities on repeated runs)
- Friends/groups read-path cleanup completed for active UI flows (no mock fallback paths)
- Mobile/dev readiness pass: `npx expo start` startup verified; REST+WS critical flows validated via `backend/src/tests/e2e-smoke.ts` and `backend/src/tests/rt2-smoke.ts`

## Next recommended milestone

**P2 — Onboarding + empty states**: 3-slide onboarding before `AuthScreen`
(gated by first-launch flag) and upgrade of the `EmptyState` component
(icon + title + body + optional CTA) across ~10 call sites. Full agreed
scope in [`docs/HANDOFF.md §4`](./HANDOFF.md). Other roadmap priorities (P3
observability, P4 dark theme, P5 tests, P6 EAS, P7 push, P8 WS backfill)
are sequenced in the handoff doc; do not reorder without asking the user.

Open PR: [#3 — pendingJoin native fallback](https://github.com/magtophard-ai/Plans/pull/3)
(must merge before P2 touches the auth/deep-link flow).
