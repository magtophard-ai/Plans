# AGENTS.md

## Environment

- **Disk C has 0 bytes free.** All npm commands must redirect cache:
  ```
  $env:npm_config_cache="E:\npm-cache"; npm <command> --legacy-peer-deps
  ```
  Missing either the cache redirect or `--legacy-peer-deps` will fail.

- **Working directory** for all app commands: `e:\FEST\V1\fest-app`
- **Backend** runs on port 3001: `$env:PORT="3001"; E:\FEST\V1\backend\node_modules\.bin\tsx.cmd E:\FEST\V1\backend\src\index.ts`
- **PostgreSQL 17** Windows service `postgresql-x64-17`, `psql` at `C:\Program Files\PostgreSQL\17\bin\`

## Commands

| Action | Command |
|--------|---------|
| Install (frontend) | `$env:npm_config_cache="E:\npm-cache"; npm install --legacy-peer-deps` |
| Install (backend) | `$env:npm_config_cache="E:\npm-cache"; npm install --legacy-peer-deps` (workdir: `E:\FEST\V1\backend`) |
| DB migrate | `E:\FEST\V1\backend\node_modules\.bin\tsx.cmd E:\FEST\V1\backend\src\db\migrate.ts` (workdir: `E:\FEST\V1\backend`) |
| DB seed | `E:\FEST\V1\backend\node_modules\.bin\tsx.cmd E:\FEST\V1\backend\src\db\seed.ts` (workdir: `E:\FEST\V1\backend`) |
| Dev (web) | `npx expo start --web` → http://localhost:8081 |
| Dev (mobile) | `npx expo start` |
| Type check (frontend main app) | `npx tsc --noEmit` |
| Type check (fest-animations, optional) | `npx tsc --noEmit -p tsconfig.fest-animations.json` |
| Type check (backend) | `npx tsc --noEmit` (workdir: `E:\FEST\V1\backend`) |
| Smoke build | `npx expo export --platform web` |
| Start backend | `E:\FEST\V1\backend\node_modules\.bin\tsx.cmd E:\FEST\V1\backend\src\index.ts` (workdir: `E:\FEST\V1\backend`) |

No `npm test` script exists. No linter is configured — use `tsc --noEmit` as the verification gate. Always run it after code changes.

## Architecture

Expo + React Native + TypeScript frontend backed by Fastify + PostgreSQL API. Backend is source of truth for all mutations, invitations, notifications, plan lifecycle, participant mutations, proposal lifecycle, voting rules, messages. Frontend is a thin API consumer with optimistic UI for votes only.

### Navigation

- **RootStack**: MainTabs + Notifications overlay
- **MainTabs** (5 bottom tabs): HomeTab → HomeStack, SearchTab (standalone), CreateTab (standalone), PlansTab → PlansStack, ProfileTab (standalone)
- **HomeStack**: HomeFeed → EventDetails → CreatePlanFromEvent / VenueDetails
- **PlansStack**: PlansList → PlanDetails / GroupDetails
- **Cross-tab navigation**: must use `(navigation as any).navigate('TabName', { screen: 'ScreenName', params })` — `CompositeNavigationProp` typing is unreliable with Expo SDK 54 + React Navigation 7. Do not attempt to type this tighter.

### Key files

| File | Why it matters |
|------|---------------|
| `src/types/index.ts` | All entity types + `ACTIVITY_LABELS` constant |
| `src/theme/index.ts` | Design tokens. `theme.spacing` is Platform-adapted (web ≈15% tighter). Use `theme.spacing.*` everywhere, never hardcode. |
| `src/navigation/types.ts` | Route param types for all 3 navigators |
| `src/components/ScreenContainer.tsx` | `maxWidth: 600` + centered on web, transparent on mobile. Every screen must be wrapped in this. |
| `docs/ProductPlan.md` | Canonical product spec — overrides any other doc or assumption |
| `src/api/client.ts` | Base HTTP client (`api()`, `camelize()`, `setToken()`). All API calls go through this. Converts `snake_case` → `camelCase`. |
| `contracts/mvp/api/openapi.yaml` | Full API contract — source of truth for endpoints |
| `contracts/mvp/db/001_init.sql` | DB schema |
| `contracts/mvp/docs/screen_endpoint_mapping.md` | Which screen calls which endpoint |
| `contracts/mvp/docs/acceptance_criteria.md` | Per-screen acceptance checklist |

### Frontend API layer (`src/api/`)

| File | Endpoints |
|------|-----------|
| `client.ts` | Base HTTP client, `camelize`, token management |
| `auth.ts` | `POST /auth/otp/send`, `POST /auth/otp/verify`, `GET /auth/me` |
| `events.ts` | `GET /events`, `POST/DELETE /events/:id/interest`, `POST/DELETE /events/:id/save` |
| `plans.ts` | Full plan CRUD + proposals, votes, finalize/unfinalize, repeat, messages, invite participant, share-link preview + join (`/plans/by-token/:token`) |
| `invitations.ts` | `GET /invitations`, `PATCH /invitations/:id` (accept/decline) |
| `notifications.ts` | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |
| `search.ts` | `GET /search/events` |
| `ws.ts` | Singleton WS client: connect, disconnect, subscribe, unsubscribe, reconnect with exponential backoff, heartbeat/stale detection |
| `wsHandler.ts` | Routes WS events (`plan.message.created`, `plan.proposal.created`, `plan.vote.changed`, `plan.finalized`, `plan.unfinalized`, `plan.cancelled`, `plan.completed`, `plan.participant.added`, `plan.participant.updated`, `plan.participant.removed`, `notification.created`) to stores |

### WebSocket (realtime)

- **Protocol**: `ws://localhost:3001/api/ws` — auth via JWT, subscribe/unsubscribe channels
- **REST is sole source of truth** — WS is push-only, no transactional writes in WS handlers
- **Channels**: `user:{userId}` (notifications), `plan:{planId}` (messages, proposals, votes, lifecycle, participants)
- **Frontend**: `ws.ts` singleton with reconnect + resync; `wsHandler.ts` routes to stores
- **Dedup**: `pushMessage` uses `client_message_id` reconciliation + ID check; `pushProposal` uses ID check; `pushVote` filters optimistic votes
- **Emitted events (11)**: `plan.message.created`, `plan.proposal.created`, `plan.vote.changed`, `plan.finalized`, `plan.unfinalized`, `plan.cancelled`, `plan.completed`, `plan.participant.added`, `plan.participant.updated`, `plan.participant.removed` (all on `plan:{id}`); `notification.created` (on `user:{id}`). Lifecycle and participant events are merged in-place by refetching the plan on the frontend.

### Zustand stores (7)

`authStore`, `eventsStore`, `plansStore`, `groupsStore`, `notificationsStore`, `invitationsStore`, `friendsStore`

- Cross-store access uses `OtherStore.getState()` — used in `invitationsStore` → `plansStore`.
- All stores start empty (no mock data) and populate from API calls.
- All stores have `loading: boolean`, `error: string | null`, and `clearError()` fields.
- `plansStore` is fully API-backed: `apiCreatePlan`, `apiFinalize`, `apiUnfinalize`, `apiCreateProposal`, `apiVote`, `apiUnvote`, `apiRepeat`, `apiSendMessage`, `apiFetchMessages`, `apiFetchProposals`, `apiInviteParticipant`.
- `notificationsStore` has **no `addNotification`** — all notifications are created server-side only.
- `invitationsStore` has **no `addInvitation`** — backend creates invitations atomically on plan creation / participant invite.
- `invitationsStore` accept/decline use optimistic update with rollback on failure.
- `eventsStore` toggleInterest/toggleSave use optimistic update with immutable rollback on failure.
- `friendsStore` is fully API-backed via `GET /users/friends`.

### Plan lifecycle

`active → finalized → completed`. Cancel from `active` or `finalized`. "Повторить" on completed creates a new active plan with same participants. All transitions are server-confirmed.

### Backend routes (`backend/src/routes/`)

| File | Routes |
|------|--------|
| `auth.ts` | OTP mock (code `1111`), JWT |
| `users.ts` | `/users/me` (GET, PATCH), `/users/search`, `/users/friends`, `/users/friends/:id` (POST, PATCH, DELETE), `/users/:id` |
| `events.ts` | Events + social proof (interested, saved, friends) |
| `venues.ts` | Venues + events by venue |
| `plans.ts` | Full plan CRUD, participants (GET/POST/PATCH/DELETE), proposals, votes, finalize/unfinalize, cancel/complete, repeat, messages, share-link preview/join (`GET /plans/by-token/:token`, `POST /plans/by-token/:token/join`) |
| `invitations.ts` | List + PATCH (accept with atomic participant creation + 15-limit FOR UPDATE lock) |
| `groups.ts` | List, get, invite-only member add |
| `notifications.ts` | List + mark read |
| `search.ts` | `GET /search/events` (text/date/category filters) |
| `ws.ts` | WebSocket route: auth, subscribe/unsubscribe, heartbeat (ping/pong) |

## Product constraints

- **Canonical spec**: `docs/ProductPlan.md` — source of truth for all product rules
- **Russian UI only** — all user-facing strings in Russian
- **No features beyond MVP** — no group chat, map, calendar entity, email auth, venue admin, event creation
- **Plan is `active` on creation** — no draft/invited state at plan level
- **Max 15 participants per plan**
- **Chat is inside PlanDetails only** — no standalone chat
- **Pre-meet** = simple text fields, no voting
- **11 notification types**: `plan_invite`, `group_invite`, `proposal_created`, `plan_finalized`, `plan_unfinalized`, `event_time_changed`, `event_cancelled`, `plan_reminder`, `plan_completed`, `friend_request`, `plan_join_via_link`
- **No client-side notification creation** — all notifications created server-side

## Web layout conventions

- `ScreenContainer` wraps every screen (maxWidth 600, centered on web)
- `theme.spacing` is already Platform-adapted — always use it, never hardcode
- Image/hero heights: `Platform.select({ web: smaller, default: larger })` + `aspectRatio` on web
- Tab bar: maxWidth 600 on web
- Auth form: separate maxWidth 400 on web

## Mock-only areas (no backend endpoint yet)

None — all stores are API-backed. `friendsStore` uses `GET /users/friends`.

## Gotchas

- `Set<string>` in Zustand state (`interestedIds`, `savedIds`) is not serializable — breaks with persistence, fine for in-memory only
- `PlanParticipant.user` is `User | undefined` but `authStore.user` is `User | null` — bridge with `?? undefined`
- Date utils (`dates.ts`) accept `null | undefined` and return `''` — safe to call with any nullable date field
- `CreatePlanForm` returns `planId` via `onDone` callback, not via navigation params
- Expo SDK 54 peer dep conflicts — always `--legacy-peer-deps`
- `package.json` has no `"test"` script — `npm test` errors, not just no-op
- Frontend quality gate excludes `src/fest-animations/**` in `fest-app/tsconfig.json`; validate this folder separately with `tsconfig.fest-animations.json` when needed
- **Windows Date serialization bug**: pg driver returns JS Date objects for `timestamptz` columns. `Date.toString()` on Windows produces `GMT+0300` format which PostgreSQL rejects. Always convert via `Date.toISOString()` or use parameterized queries — never string-interpolate Date values into SQL.
- `camelize()` in `api/client.ts` converts all `snake_case` API keys to `camelCase` for frontend types. Backend responses use `snake_case`, frontend uses `camelCase`.
- Backend `POST /plans` creates plan + participants + invitations + notifications atomically in one transaction. Frontend `apiCreatePlan` only calls this endpoint — no local plan creation.
