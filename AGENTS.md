# AGENTS.md

## Environment

All commands are relative to the repo root (wherever you cloned it). On the
canonical Windows dev box that is `E:\FEST\V1\`; on Linux/macOS it is
whatever directory `git clone` landed the repo in. Use whichever path style
matches your shell; the commands themselves stay the same.

- **Disk C is assumed full on the canonical Windows dev box.** All npm commands
  must redirect cache to a volume with space:
  ```
  $env:npm_config_cache="E:\npm-cache"; npm <command> --legacy-peer-deps
  ```
  On Linux/macOS the cache redirect is not needed; just `npm install --legacy-peer-deps`.
  `--legacy-peer-deps` is required on both platforms because Expo SDK 54 has peer-dep conflicts.
- **Backend** runs on port 3001 from the canonical Spring implementation (`cd backend-spring && PORT=3001 ./gradlew bootRun`, or `$env:PORT="3001"; .\gradlew.bat bootRun` on PowerShell). `backend/` is archived legacy Fastify code for rollback/history only.
- **PostgreSQL 17**: Windows uses the native service `postgresql-x64-17` (`psql` at `C:\Program Files\PostgreSQL\17\bin\`). Linux/macOS use the `postgres:17` docker image — see `docs/DEMO_SETUP.md`.

## Commands

All `workdir:` entries are relative to the repo root. On Windows prefix `npm`
commands with `$env:npm_config_cache="E:\npm-cache";` as described in
**Environment**; on Linux/macOS run them plain.

| Action | Command |
|--------|---------|
| Install (frontend) | `npm install --legacy-peer-deps` (workdir: `fest-app/`) |
| Install (canonical backend) | no separate install; use Gradle wrapper (workdir: `backend-spring/`) |
| DB migrate | automatic Flyway on Spring startup (workdir: `backend-spring/`) |
| DB seed | `psql postgres://postgres:postgres@localhost:5432/plans -f backend-spring/src/main/resources/db/seed/R__dev_seed.sql` (repo root) |
| Dev (web) | `npx expo start --web` → http://localhost:8081 (workdir: `fest-app/`) |
| Dev (mobile) | `npx expo start` (workdir: `fest-app/`) |
| Type check (frontend main app) | `npx tsc --noEmit` (workdir: `fest-app/`) |
| Type check (fest-animations, optional) | `npx tsc --noEmit -p tsconfig.fest-animations.json` (workdir: `fest-app/`) |
| Test (canonical backend) | `./gradlew test` (workdir: `backend-spring/`) |
| Smoke build | `npx expo export --platform web` (workdir: `fest-app/`) |
| Start backend | `PORT=3001 ./gradlew bootRun` (workdir: `backend-spring/`) |
| REST smoke | `./gradlew coreSmokeTest` (workdir: `backend-spring/`) |
| Realtime smoke | `./gradlew realtimeSmokeTest` (workdir: `backend-spring/`) |
| Content ops import | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="import --file path/to/event.json"` (workdir: `backend-spring/`) |
| Content ops publish | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="publish --ingestion-id <id> [--venue-id <id>] [--force-link-event-id <id>]"` (workdir: `backend-spring/`) |
| Content ops update | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="update --ingestion-id <id>"` (workdir: `backend-spring/`) |
| Content ops cancel | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="cancel --event-id <id> --reason \"...\""` (workdir: `backend-spring/`) |
| Content ops smoke | `./gradlew contentOpsSmokeTest` (workdir: `backend-spring/`) |
| Full Spring smoke | `./gradlew fullSpringSmokeTest` (workdir: `backend-spring/`) |

No frontend `npm test` script exists. No linter is configured — use `npx tsc --noEmit` for frontend verification and Gradle tests/smokes for Spring backend verification. Legacy Fastify checks in `backend/` are archive/rollback checks only.

## Architecture

Expo + React Native + TypeScript frontend backed by the canonical Spring Boot + PostgreSQL API. Backend is source of truth for all mutations, invitations, notifications, plan lifecycle, participant mutations, proposal lifecycle, voting rules, messages. Frontend is a thin API consumer with optimistic UI for votes only.

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

### Backend API surface

Canonical implementations live under `backend-spring/src/main/java/com/plans/backend/api/**`. The archived Fastify routes in `backend/src/routes/**` remain useful as a legacy map, but active changes should target Spring.

| Area | Routes |
|------|--------|
| Auth | OTP mock (code `1111`), JWT |
| Users | `/users/me` (GET, PATCH), `/users/search`, `/users/friends`, `/users/friends/:id` (POST, PATCH, DELETE), `/users/:id` |
| Events | Events + social proof (interested, saved, friends) |
| Venues | Venues + events by venue |
| Plans | Full plan CRUD, participants (GET/POST/PATCH/DELETE), proposals, votes, finalize/unfinalize, cancel/complete, repeat, messages, share-link preview/join (`GET /plans/by-token/:token`, `POST /plans/by-token/:token/join`) |
| Invitations | List + PATCH (accept with atomic participant creation + 15-limit FOR UPDATE lock) |
| Groups | List, get, invite-only member add |
| Notifications | List + mark read |
| Search | `GET /search/events` (text/date/category filters) |
| Realtime | WebSocket route: auth, subscribe/unsubscribe, heartbeat (ping/pong) |

### Content Ops CLI

- Internal real-event supply is CLI-first; no public admin UI or venue self-serve.
- `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="import --file path/to/event.json"` imports a manually normalized JSON payload into `event_ingestions`; `--source-url` is metadata only and does not fetch/parse.
- Required JSON fields: `source_type`, `title`, `starts_at`, `ends_at`, `venue_name`, `address`, `cover_image_url`; optional: `source_url`, `source_event_key`, `description`, `external_url`, `category`, `tags`, `price_info`, `operator_note`.
- Publish/update/cancel through Spring `publish`, `update`, `sync`, and `cancel` commands; `sync` only updates already-published/linked events and never creates a public event.
- Duplicate protection is exact source key first, then fingerprint, then legacy fallback on normalized event title + venue name/address + starts_at; duplicate candidates require `--force-link-event-id`.
- Venue auto-create is a v1 compromise: exact name+address is reused; otherwise `ops:publish` creates a venue with `lat=0/lng=0`. Operators should pass `--venue-id` when coordinates matter.
- Public lists (`GET /events`, `/search/events`, `/venues/:id/events`) show only `events.status='published'`; `GET /events/:id` can return cancelled events so linked plans/notifications do not 404.
- Safe synthetic payload example: `docs/examples/content-ops-event.example.json`.

## Product constraints

- **Canonical spec**: `docs/ProductPlan.md` — source of truth for all product rules
- **Russian UI only** — all user-facing strings in Russian
- **No features beyond MVP** — no group chat, map, calendar entity, email auth, venue admin, event creation
- **Plan is `active` on creation** — no draft/invited state at plan level
- **Max 15 participants per plan**
- **Chat is inside PlanDetails only** — no standalone chat
- **Pre-meet** = simple text fields, no voting
- **12 notification types**: `plan_invite`, `group_invite`, `proposal_created`, `plan_finalized`, `plan_unfinalized`, `event_time_changed`, `event_cancelled`, `plan_reminder`, `plan_completed`, `friend_request`, `friend_accepted`, `plan_join_via_link`. Spring must preserve this contract in Flyway migrations and notification services.
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
- Spring backend `POST /plans` creates plan + participants + invitations + notifications atomically in one transaction. Frontend `apiCreatePlan` only calls this endpoint — no local plan creation.
