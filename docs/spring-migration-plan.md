# Spring Boot Migration Plan

This is a historical migration plan. Spring Boot in `backend-spring/` is now the current canonical backend; Fastify in `backend/` is archived legacy code for history, rollback drills, and legacy parity audits only.

Цель миграции была: добавить новый backend в `backend-spring/` и поэтапно довести его до совместимости с legacy Fastify/TypeScript backend без регрессий для существующего Expo frontend.

## Guardrails

- Миграция не удаляла и не переписывала `backend/`; он сохранён как archived legacy.
- Frontend, Zustand stores, API client и contracts остаются неизменными, если audit конкретного slice не докажет обратное.
- Spring Boot backend живёт в `backend-spring/` и является текущим canonical backend.
- Сохраняются `/api` prefix, endpoint paths, request/response envelopes, HTTP statuses, error bodies, JWT behavior и WebSocket protocol.
- REST остаётся source of truth; WebSocket остаётся push-only.
- Hibernate `ddl-auto` не используется для генерации схемы. Схема должна идти из `contracts/mvp/db/001_init.sql` плюс текущие idempotent migrations из `backend/src/db/migrate.ts`.
- Каждый PR должен быть маленьким vertical slice с parity-проверками.

## Current sources reviewed

- Runtime/status docs: `README.md`, `docs/CURRENT_STATUS.md`, `docs/HANDOFF.md`, `backend/README.md`.
- Contracts: `contracts/mvp/api/openapi.yaml`, `contracts/mvp/db/001_init.sql`.
- Existing backend: `backend/src/routes/*`, `backend/src/db/*`, `backend/src/services/*`, `backend/src/scripts/contentOps.ts`, `backend/src/tests/*`.

## Migration approach

Recommended Spring stack:

- Java 21, Spring Boot 3.x, Gradle or Maven wrapper committed under `backend-spring/`.
- `spring-boot-starter-web`, `spring-boot-starter-websocket`, `spring-boot-starter-security`, `spring-boot-starter-validation`.
- `spring-boot-starter-jdbc` or jOOQ over raw SQL first. Avoid JPA schema management; if JPA is introduced later, set `spring.jpa.hibernate.ddl-auto=none`.
- PostgreSQL driver and explicit Flyway migrations under `backend-spring/src/main/resources/db/migration`, keeping `contracts/mvp/db/001_init.sql` as the baseline contract reference.
- DTOs should preserve snake_case JSON. Use `@JsonProperty` or a global snake_case naming strategy, but verify all envelopes against frontend smoke tests.
- JWT should use HS256 and the same `JWT_SECRET`; access token payload includes `userId`, refresh token additionally includes `type: "refresh"`.

## REST endpoint inventory

Complexity scale: Low = direct CRUD/read, Medium = joins/validation/notifications, High = transactional lifecycle/realtime/parity risk.

| Method | Path | Legacy TS file | Spring controller/service | Complexity |
|---|---|---|---|---|
| GET | `/api/health` | `backend/src/index.ts` | `HealthController` | Low |
| POST | `/api/auth/otp/send` | `backend/src/routes/auth.ts`, `backend/src/auth/otp.ts` | `AuthController` + `OtpService` | Medium |
| POST | `/api/auth/otp/verify` | `backend/src/routes/auth.ts`, `backend/src/auth/otp.ts` | `AuthController` + `OtpService` + `JwtService` + `UserService` | Medium |
| POST | `/api/auth/refresh` | `backend/src/routes/auth.ts` | `AuthController` + `JwtService` | Medium |
| GET | `/api/auth/me` | `backend/src/routes/auth.ts` | `AuthController` + `AuthPrincipal` + `UserService` | Low |
| GET | `/api/users/me` | `backend/src/routes/users.ts` | `UsersController` + `UserService` | Low |
| PATCH | `/api/users/me` | `backend/src/routes/users.ts` | `UsersController` + `UserService` | Medium |
| GET | `/api/users/search` | `backend/src/routes/users.ts` | `UsersController` + `UserSearchService` | Medium |
| GET | `/api/users/:id` | `backend/src/routes/users.ts` | `UsersController` + `UserService` | Low |
| GET | `/api/users/friends` | `backend/src/routes/users.ts` | `UsersController` + `FriendshipService` | Medium |
| POST | `/api/users/friends/:id` | `backend/src/routes/users.ts` | `UsersController` + `FriendshipService` + `NotificationService` | Medium |
| PATCH | `/api/users/friends/:id` | `backend/src/routes/users.ts` | `UsersController` + `FriendshipService` + `NotificationService` | Medium |
| DELETE | `/api/users/friends/:id` | `backend/src/routes/users.ts` | `UsersController` + `FriendshipService` | Low |
| GET | `/api/events` | `backend/src/routes/events.ts` | `EventsController` + `EventQueryService` | Medium |
| GET | `/api/events/:id` | `backend/src/routes/events.ts` | `EventsController` + `EventQueryService` | Medium |
| POST | `/api/events/:id/interest` | `backend/src/routes/events.ts` | `EventsController` + `EventEngagementService` | Low |
| DELETE | `/api/events/:id/interest` | `backend/src/routes/events.ts` | `EventsController` + `EventEngagementService` | Low |
| POST | `/api/events/:id/save` | `backend/src/routes/events.ts` | `EventsController` + `EventEngagementService` | Low |
| DELETE | `/api/events/:id/save` | `backend/src/routes/events.ts` | `EventsController` + `EventEngagementService` | Low |
| GET | `/api/venues/:id` | `backend/src/routes/venues.ts` | `VenuesController` + `VenueService` | Low |
| GET | `/api/venues/:id/events` | `backend/src/routes/venues.ts` | `VenuesController` + `EventQueryService` | Low |
| GET | `/api/search/events` | `backend/src/routes/search.ts` | `SearchController` + `EventSearchService` | Medium |
| GET | `/api/plans` | `backend/src/routes/plans.ts` | `PlansController` + `PlanQueryService` | High |
| POST | `/api/plans` | `backend/src/routes/plans.ts` | `PlansController` + `PlanCommandService` + `NotificationService` | High |
| GET | `/api/plans/by-token/:token` | `backend/src/routes/plans.ts` | `PlanShareController` + `PlanShareService` | Medium |
| POST | `/api/plans/by-token/:token/join` | `backend/src/routes/plans.ts` | `PlanShareController` + `PlanShareService` + `NotificationService` | High |
| GET | `/api/plans/:id` | `backend/src/routes/plans.ts` | `PlansController` + `PlanQueryService` | High |
| PATCH | `/api/plans/:id` | `backend/src/routes/plans.ts` | `PlansController` + `PlanCommandService` | Medium |
| POST | `/api/plans/:id/cancel` | `backend/src/routes/plans.ts` | `PlanLifecycleController` + `PlanLifecycleService` + `RealtimePublisher` | Medium |
| POST | `/api/plans/:id/complete` | `backend/src/routes/plans.ts` | `PlanLifecycleController` + `PlanLifecycleService` + `RealtimePublisher` | Medium |
| GET | `/api/plans/:planId/participants` | `backend/src/routes/plans.ts` | `PlanParticipantsController` + `PlanParticipantService` | Medium |
| POST | `/api/plans/:planId/participants` | `backend/src/routes/plans.ts` | `PlanParticipantsController` + `PlanParticipantService` + `NotificationService` + `RealtimePublisher` | High |
| PATCH | `/api/plans/:planId/participants/:uid` | `backend/src/routes/plans.ts` | `PlanParticipantsController` + `PlanParticipantService` + `RealtimePublisher` | Medium |
| DELETE | `/api/plans/:planId/participants/:uid` | `backend/src/routes/plans.ts` | `PlanParticipantsController` + `PlanParticipantService` + `RealtimePublisher` | Medium |
| GET | `/api/plans/:id/proposals` | `backend/src/routes/plans.ts` | `PlanProposalsController` + `ProposalService` | Medium |
| POST | `/api/plans/:id/proposals` | `backend/src/routes/plans.ts` | `PlanProposalsController` + `ProposalService` + `NotificationService` + `RealtimePublisher` | High |
| POST | `/api/plans/:id/proposals/:proposalId/vote` | `backend/src/routes/plans.ts` | `PlanVotesController` + `VoteService` + `RealtimePublisher` | High |
| DELETE | `/api/plans/:id/proposals/:proposalId/vote` | `backend/src/routes/plans.ts` | `PlanVotesController` + `VoteService` + `RealtimePublisher` | Medium |
| POST | `/api/plans/:id/finalize` | `backend/src/routes/plans.ts` | `PlanLifecycleController` + `PlanLifecycleService` + `NotificationService` + `RealtimePublisher` | High |
| POST | `/api/plans/:id/unfinalize` | `backend/src/routes/plans.ts` | `PlanLifecycleController` + `PlanLifecycleService` + `NotificationService` + `RealtimePublisher` | High |
| POST | `/api/plans/:id/repeat` | `backend/src/routes/plans.ts` | `PlanLifecycleController` + `PlanRepeatService` + `NotificationService` | High |
| GET | `/api/plans/:id/messages` | `backend/src/routes/plans.ts` | `PlanMessagesController` + `MessageService` | Medium |
| POST | `/api/plans/:id/messages` | `backend/src/routes/plans.ts` | `PlanMessagesController` + `MessageService` + `RealtimePublisher` | Medium |
| GET | `/api/invitations` | `backend/src/routes/invitations.ts` | `InvitationsController` + `InvitationService` | Medium |
| PATCH | `/api/invitations/:id` | `backend/src/routes/invitations.ts` | `InvitationsController` + `InvitationService` + `RealtimePublisher` | High |
| GET | `/api/groups` | `backend/src/routes/groups.ts` | `GroupsController` + `GroupService` | Medium |
| POST | `/api/groups` | `backend/src/routes/groups.ts` | `GroupsController` + `GroupService` + `NotificationService` | High |
| GET | `/api/groups/:id` | `backend/src/routes/groups.ts` | `GroupsController` + `GroupService` | Medium |
| POST | `/api/groups/:id/members` | `backend/src/routes/groups.ts` | `GroupMembersController` + `GroupService` + `NotificationService` | Medium |
| DELETE | `/api/groups/:id/members/:uid` | `backend/src/routes/groups.ts` | `GroupMembersController` + `GroupService` | Medium |
| GET | `/api/notifications` | `backend/src/routes/notifications.ts` | `NotificationsController` + `NotificationService` | Low |
| PATCH | `/api/notifications/:id/read` | `backend/src/routes/notifications.ts` | `NotificationsController` + `NotificationService` | Low |
| PATCH | `/api/notifications/read-all` | `backend/src/routes/notifications.ts` | `NotificationsController` + `NotificationService` | Low |
| GET | `/api/ws` | `backend/src/routes/ws.ts` | `RealtimeWebSocketHandler` + `JwtService` + `PlanParticipantService` | High |

Notes:

- `backend/README.md` documents the archived legacy implementation and may omit newer endpoints such as `/api/users/search`, `/api/plans/by-token/:token`, plan proposals/votes/messages, and finalize/unfinalize/repeat details. Active Spring work should follow `contracts/mvp/api/openapi.yaml` plus the canonical Spring implementation.
- Fastify route param names differ from OpenAPI in a few places (`:proposalId` vs `{pid}`); URLs must match frontend paths, not Java method variable names.

## DB schema inventory

### Enums

| Enum | Values | Used by tables/logic |
|---|---|---|
| `event_category` | `music`, `theatre`, `exhibition`, `sport`, `food`, `party`, `workshop`, `other` | `events.category`, `event_ingestions.category`, event/search filters, Content Ops validation |
| `activity_type` | `cinema`, `coffee`, `bar`, `walk`, `dinner`, `sport`, `exhibition`, `other` | `plans.activity_type`, plan creation/repeat, share preview |
| `friendship_status` | `pending`, `accepted` | `friendships.status`, friend request list/actions |
| `place_status` | `confirmed`, `proposed`, `undecided` | `plans.place_status`, proposals/finalize/unfinalize |
| `time_status` | `confirmed`, `proposed`, `undecided` | `plans.time_status`, proposals/finalize/unfinalize |
| `plan_lifecycle` | `active`, `finalized`, `completed`, `cancelled` | `plans.lifecycle_state`, plan lifecycle filters/actions |
| `participant_status` | `invited`, `going`, `thinking`, `cant` | `plan_participants.status`, invitations, participant updates |
| `proposal_type` | `place`, `time` | `plan_proposals.type`, proposals/votes/finalize |
| `proposal_status` | `active`, `finalized`, `superseded` | `plan_proposals.status`, proposal lists/vote rules/finalize |
| `group_role` | `member` | `group_members.role` |
| `invitation_type` | `plan`, `group` | `invitations.type`, invitation target resolution |
| `invitation_status` | `pending`, `accepted`, `declined` | `invitations.status`, invitation list/respond |
| `notification_type` | `plan_invite`, `group_invite`, `proposal_created`, `plan_finalized`, `plan_unfinalized`, `event_time_changed`, `event_cancelled`, `plan_reminder`, `plan_completed`, `friend_request`, `friend_accepted`, `plan_join_via_link` | `notifications.type`, Spring `NotificationService` |
| `message_type` | `user`, `system`, `proposal_card` | `messages.type`, chat and proposal-card messages |
| `message_context` | `plan` | `messages.context_type` |

### Tables and additive migrations

| Table | Source | Used by |
|---|---|---|
| `users` | `001_init.sql` | Auth OTP user creation, profiles, friends, participants/members, message senders |
| `friendships` | `001_init.sql` | `/users/friends`, `/users/search`, notifications `friend_request`/`friend_accepted` |
| `venues` | `001_init.sql` | Events, venue detail/list, Content Ops venue resolve/autocreate |
| `events` | `001_init.sql` + `migrate.ts` columns | Event feeds/detail/search, venue events, linked plans, Content Ops |
| `event_interests` | `001_init.sql` | Interest toggles and friends interested social proof |
| `saved_events` | `001_init.sql` | Save/unsave toggles |
| `plans` | `001_init.sql` with `share_token` pre/post migration and unique index | Plan CRUD/lifecycle/share-token join/list/detail |
| `plan_participants` | `001_init.sql` | Plan access, participant list/status, invitations, WS subscribe authorization, 15-person cap |
| `plan_proposals` | `001_init.sql` | Proposal CRUD, finalize/unfinalize, proposal-card messages |
| `votes` | `001_init.sql` | Vote/unvote, max-2-votes rule, proposal response embedding |
| `groups` | `001_init.sql` | Groups list/detail/create, group invitations |
| `group_members` | `001_init.sql` | Group access/membership, invitation accept |
| `invitations` | `001_init.sql` | Plan/group invites, atomic accept/decline |
| `notifications` | `001_init.sql` | Notification list/read, server-created push notifications |
| `messages` | `001_init.sql` + `client_message_id` migration | Plan chat, system messages, proposal cards, optimistic message reconciliation |
| `event_ingestions` | `migrate.ts` | Content Ops import/list/show/publish/update/sync/cancel |

Historical additive migrations from the legacy Fastify path that Spring preserves through Flyway:

- `messages.client_message_id text`.
- `event_ingestions` table with states `imported`, `duplicate`, `published`, `cancelled` and indexes:
  - `idx_event_ingestions_state_updated`;
  - `idx_event_ingestions_fingerprint`;
  - `idx_event_ingestions_linked_event`.
- `events` columns: `status`, `source_type`, `source_url`, `source_event_key`, `source_fingerprint`, `source_updated_at`, `last_ingested_at`, `updated_at`, `cancelled_at`, `cancellation_reason`.
- `events` indexes: `idx_events_status_starts_at`, `idx_events_source_fingerprint`, unique `idx_events_source_key_unique`.
- Unique `idx_plans_share_token_unique` and share-token backfill for old rows.
- Idempotent enum additions for all `NOTIFICATION_TYPES`.

## Response envelopes and error codes expected by frontend

### Success envelopes

| Envelope/body | Endpoints |
|---|---|
| `{}` | `POST /auth/otp/send`, `POST /events/:id/interest`, `POST /events/:id/save`, `PATCH /notifications/read-all` |
| no body, 204 | `DELETE /events/:id/interest`, `DELETE /events/:id/save`, `DELETE /plans/:planId/participants/:uid`, `DELETE /plans/:id/proposals/:proposalId/vote`, `PATCH /users/friends/:id` decline, `DELETE /users/friends/:id`, `DELETE /groups/:id/members/:uid` |
| `{access_token, refresh_token, user}` | `POST /auth/otp/verify` |
| `{access_token, refresh_token}` | `POST /auth/refresh` |
| `{user}` | `GET /auth/me`, `GET /users/me`, `PATCH /users/me`, `GET /users/:id` |
| `{users}` | `GET /users/search` |
| `{friends}` | `GET /users/friends` |
| `{friendship}` | `POST /users/friends/:id`, `PATCH /users/friends/:id` accept |
| `{events, total}` | `GET /events`, `GET /venues/:id/events`, `GET /search/events` |
| `{event}` | `GET /events/:id` |
| `{venue}` | `GET /venues/:id` |
| `{plans, total}` | `GET /plans` |
| `{plan}` | `POST /plans`, `GET /plans/:id`, `PATCH /plans/:id`, lifecycle endpoints, `POST /plans/:id/repeat`, `GET /plans/by-token/:token` preview |
| `{already_joined, plan}` | `POST /plans/by-token/:token/join` |
| `{participants}` | `GET /plans/:planId/participants` |
| `{participant}` | `POST/PATCH /plans/:planId/participants...` |
| `{proposals}` | `GET /plans/:id/proposals` |
| `{proposal}` | `POST /plans/:id/proposals` |
| `{vote}` | `POST /plans/:id/proposals/:proposalId/vote` |
| `{messages}` | `GET /plans/:id/messages` |
| `{message}` | `POST /plans/:id/messages` |
| `{invitations}` | `GET /invitations` |
| `{invitation}` | `PATCH /invitations/:id` |
| `{groups}` | `GET /groups` |
| `{group}` | `POST /groups`, `GET /groups/:id` |
| `{code: "OK", message: "Invitation sent"}` | `POST /groups/:id/members` |
| `{notifications, unread_count}` | `GET /notifications` |
| `{notification}` | `PATCH /notifications/:id/read` |

Frontend `api/client.ts` throws on non-2xx with `error.status`, `error.code`, `error.body`, and message from response `message`. Error body must stay JSON object `{code, message}`.

### Error codes

| Code | HTTP status | Meaning |
|---|---:|---|
| `INVALID_PHONE` | 400 | OTP phone normalization failed |
| `INVALID_INPUT` | 400 | Generic request validation failures across auth/users/groups/plans |
| `INVALID_STATUS` | 400 | Invitation status or participant status invalid |
| `INVALID_STATE` | 400 | Plan/proposal lifecycle rule violation |
| `ALREADY_RESPONDED` | 400 | Invitation was already accepted/declined |
| `INVALID_OTP` | 401 | OTP verify failed |
| `INVALID_TOKEN` | 401 | Refresh token missing/invalid/wrong type |
| `UNAUTHORIZED` | 401 | Missing/invalid bearer token from global auth handler |
| `FORBIDDEN` | 403 | Caller cannot perform action |
| `NOT_FOUND` | 404 | User/event/venue/plan/proposal/vote/group/invitation/notification missing |
| `USERNAME_TAKEN` | 409 | Profile username conflict |
| `PLAN_FULL` | 409 | 15-participant cap reached |
| `ALREADY_PARTICIPANT` | 409 | Invite existing plan participant |
| `ALREADY_VOTED` | 409 | Duplicate vote |
| `MAX_VOTES_EXCEEDED` | 409 | More than 2 votes per proposal type |
| `REQUEST_ALREADY_SENT` | 409 | Duplicate outgoing friend request |
| `ALREADY_FRIENDS` | 409 | Friend request to accepted friendship |
| `ALREADY_MEMBER` | 409 | Group member already exists |
| `ALREADY_INVITED` | 409 | Pending group invitation already exists |
| `OTP_LOCKED` | 429 | Too many invalid OTP attempts |
| `RATE_LIMITED` | 429 | Global rate-limit error envelope |
| `INTERNAL_ERROR` | 500 | Unhandled backend error |

Client-only code:

- `OFFLINE` is generated in `fest-app/src/api/client.ts` before fetch for mutating calls when browser offline; the backend must not emit this code.

## Realtime channels and events

Connection: `ws://<host>/api/ws` (or `wss://` derived from API base). JWT auth happens after socket open with a JSON message, not via query param/header.

Client-to-server messages:

| Message | Behavior |
|---|---|
| `{type: "auth", token}` | Verifies JWT. On success sends `{type: "auth_ok", userId}` and implicitly tracks `user:{userId}`. On failure sends `{type: "auth_error", message: "Invalid token"}` then closes. |
| `{type: "subscribe", channel}` | Allows `user:{ownUserId}` or `plan:{planId}` if caller is a participant. Sends `{type: "subscribed", channel}`. |
| `{type: "unsubscribe", channel}` | Removes channel and sends `{type: "unsubscribed", channel}`. |
| `{type: "pong"}` | Heartbeat response. |

Server-to-client control/error messages:

- `{type: "ping"}` every 30s; close if pong stale for >10s.
- `{type: "error", message: "Not authenticated"}`.
- `{type: "error", message: "Invalid plan id"}`.
- `{type: "error", message: "Not a participant of this plan"}`.
- `{type: "error", message: "Cannot subscribe to this channel"}`.
- `{type: "error", message: "Unknown message type"}`.
- `{type: "error", message: "Internal error"}`.

Server event wrapper:

```json
{"type":"event","channel":"plan:<uuid>","event":"plan.message.created","payload":{}}
```

Channels/events:

| Channel | Event | Trigger | Payload shape notes |
|---|---|---|---|
| `plan:{planId}` | `plan.message.created` | `POST /plans/:id/messages` | Message with sender and `client_message_id` |
| `plan:{planId}` | `plan.proposal.created` | `POST /plans/:id/proposals` | Proposal fields plus `votes: []` |
| `plan:{planId}` | `plan.vote.changed` | vote/unvote endpoints | `{proposal_id, plan_id, voter_id, action, vote_id?, created_at?}` |
| `plan:{planId}` | `plan.finalized` | `POST /plans/:id/finalize` | `{plan_id, place_proposal_id, time_proposal_id}` |
| `plan:{planId}` | `plan.unfinalized` | `POST /plans/:id/unfinalize` | `{plan_id}` |
| `plan:{planId}` | `plan.cancelled` | `POST /plans/:id/cancel` | `{plan_id}` |
| `plan:{planId}` | `plan.completed` | `POST /plans/:id/complete` | `{plan_id}` |
| `plan:{planId}` | `plan.participant.added` | invite participant | `{plan_id, participant}` |
| `plan:{planId}` | `plan.participant.updated` | participant status update or invitation accept | `{plan_id, participant}` |
| `plan:{planId}` | `plan.participant.removed` | remove participant | `{plan_id, user_id}` |
| `user:{userId}` | `notification.created` | `insertNotification` equivalent | `{notificationId, type, payload, createdAt}` |

Important: REST remains the source of truth. Frontend refetches plans/messages after lifecycle/participant events and on reconnect.

## Content Ops commands

Current canonical entrypoint: Spring CLI/application runner in `backend-spring/`. The legacy Fastify entrypoint (`backend/src/scripts/contentOps.ts`) remains archived for reference.

| Command | Spring command | Required args/options | Behavior |
|---|---|---|---|
| `import` | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="import ..."` | `--file <json>`, optional `--source-url <url>` | Validates normalized JSON and writes/updates `event_ingestions`; does not publish public event |
| `list` | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="list ..."` | optional `--state imported|duplicate|published|cancelled` | Lists ingestion queue summary ordered by update time |
| `show` | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="show ..."` | `--ingestion-id <id>` | Prints full ingestion |
| `publish` | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="publish ..."` | `--ingestion-id <id>`, optional `--venue-id <id>`, `--force-link-event-id <id>` | Creates/updates public `events`, resolves/reuses/autocreates venue, links ingestion |
| `update` | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="update ..."` | `--ingestion-id <id>` | Updates already-published/linked event; fails if event is not published yet |
| `sync` | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="sync ..."` | `--file <json>`, optional `--source-url <url>` | Imports then updates existing published event; skips with message if not published yet |
| `cancel` | `SPRING_MAIN_WEB_APPLICATION_TYPE=none ./gradlew bootRun --args="cancel ..."` | `--event-id <id> --reason <text>` | Marks event cancelled, updates linked ingestions, emits `event_cancelled` notifications |

Normalized payload required fields:

- `source_type`, `title`, `starts_at`, `ends_at`, `venue_name`, `address`, `cover_image_url`.
- Optional: `source_url`, `source_event_key`, `description`, `external_url`, `category`, `tags`, `price_info`, `operator_note`.

Parity requirements:

- `source_url` stays metadata only; no network fetch/parse.
- Duplicate resolution order: exact `(source_type, source_event_key)`, then `source_fingerprint`, then legacy fallback by normalized title + venue name/address + `starts_at`.
- Fingerprint/legacy duplicate candidates require explicit `--force-link-event-id`.
- `ops:sync` must never create a public event before explicit publish.
- Public lists (`/events`, `/search/events`, `/venues/:id/events`) show only `events.status='published'`; `GET /events/:id` still reads cancelled events.
- Time updates notify linked plan participants with `event_time_changed`; cancellation emits `event_cancelled`.

## Historical PR order

1. **Docs/audit PR**: this plan only. No production code changes.
2. **Spring scaffold PR**: create `backend-spring/`, build wrapper, health endpoint under `/api/health`, config for port 3001-equivalent, CI job that compiles/tests Spring. No Fastify deletion.
3. **DB migration parity PR**: add explicit migration runner/Flyway scripts mirroring `001_init.sql` and `migrate.ts`; verify against PostgreSQL 17 with schema diff/check queries. Keep `ddl-auto=none`.
4. **Auth/users/friends PR**: OTP mock, JWT, auth middleware, `/auth/*`, `/users/*`, friendship notifications. Add contract tests for envelopes/errors.
5. **Events/venues/search PR**: event feed/detail/social proof, interest/save, venue events, search, cancelled/published filtering.
6. **Plan read/create/share PR**: `/plans` list/detail/create, share preview/join, participant cap, notifications, transaction boundaries.
7. **Participants/invitations/groups PR**: participant mutations, invitation accept/decline with `FOR UPDATE`, groups CRUD/member invitations.
8. **Proposals/votes/messages PR**: proposal creation/card message, max-votes rule, message pagination and `client_message_id`.
9. **Lifecycle PR**: finalize/unfinalize/cancel/complete/repeat, system messages, notifications, all REST smoke coverage.
10. **WebSocket PR**: `/api/ws` protocol, auth/subscribe/ping-pong, realtime event publishing, reconnect smoke parity.
11. **Content Ops PR**: Java CLI equivalent for import/list/show/publish/update/sync/cancel plus content-ops smoke parity.
12. **Switch/dual-run PR**: add documented run mode to point Expo to Spring backend, run full backend REST/realtime/content-ops smoke and frontend typecheck. This has since been superseded by Spring becoming canonical and Fastify being archived as legacy.

## Risks and verification

| Risk | Why it matters | Verification |
|---|---|---|
| JSON snake_case drift | Frontend types and `camelize()` depend on existing snake_case response keys while preserving both styles client-side | Snapshot/contract tests for every success envelope and key names; run frontend stores against Spring |
| Error envelope/status drift | `api/client.ts` maps `payload.message` and `payload.code` into operation errors | Negative tests for every code in this plan; compare against canonical Spring responses |
| JWT incompatibility | Existing frontend stores token locally and WS auth sends same JWT | Tests for access token, refresh token, expired/invalid token, WS auth message |
| PostgreSQL schema drift | Existing data and Content Ops depend on raw schema, enums, indexes, share tokens | Use migrations only; run schema inspection against PostgreSQL 17; never use Hibernate DDL |
| Transaction semantics drift | Plan creation, invitation accept, finalize/repeat and Content Ops need atomic writes | Integration tests with rollback assertions and concurrent accept over 15-participant cap |
| Date serialization/timezone drift | Current TS had Windows `Date.toString()` gotcha; frontend compares ISO strings in smokes | Always write ISO/timestamptz via parameters; assert ISO response shape for `starts_at`, messages, WS payloads |
| 15-participant cap race | Invitation accept and share join use `FOR UPDATE` on plan rows | Concurrency test with simultaneous accepts/joins |
| WebSocket protocol drift | Frontend expects custom JSON protocol, not STOMP | Use raw WebSocket handler and run `rt2-smoke.ts` equivalent unchanged |
| Notification payload drift | Frontend notification routing uses specific payload keys | Golden tests for `plan_invite`, `group_invite`, `proposal_created`, `friend_request`, `friend_accepted`, `event_time_changed`, `event_cancelled`, `plan_join_via_link` |
| Content Ops duplicate behavior drift | Real-event supply safety depends on conservative duplicate handling | Port `content-ops-smoke.ts` scenarios: source key update, fingerprint duplicate, legacy duplicate, sync skip, cancel |
| Cancelled event visibility drift | Existing plans/notifications must not 404 cancelled event detail | Tests for public lists hiding cancelled events but detail returning cancelled by id |
| Group/list contract mismatch | OpenAPI `GroupListResponse` mentions `member_count`, current TS returns groups with `members` | Preserve current TS/frontend behavior first; document any OpenAPI correction in a separate explicit PR |
| Observability differences | Current backend initializes Sentry/PostHog and tracks core-loop events | Keep non-blocking analytics wrappers; tests should not require external analytics availability |
| Rate-limit behavior drift | OTP endpoints have specific limits and global `RATE_LIMITED` envelope | Add auth rate-limit tests if behavior changes |

## Current canonical gates

- `cd backend-spring && ./gradlew test`.
- `cd backend-spring && ./gradlew coreSmokeTest`.
- `cd backend-spring && ./gradlew realtimeSmokeTest`.
- `cd backend-spring && ./gradlew contentOpsSmokeTest`.
- `cd backend-spring && ./gradlew fullSpringSmokeTest`.
- `cd fest-app && npx tsc --noEmit` should remain green because frontend contracts must not change.
- Archived legacy Fastify CI should remain green while the archive stays in the repo, but active backend work targets Spring.
