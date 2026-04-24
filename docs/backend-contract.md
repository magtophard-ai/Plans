# Backend Contract — MVP "Планы?"

Frozen scope. Contract-first. No product expansion.

---

## 1. MVP Backend Scope (MUST NOW)

| Capability | Why |
|---|---|
| Phone OTP auth (send + verify) | Login gate |
| JWT access + refresh tokens | Session management |
| User CRUD (me) | Profile screen |
| Friend list + add/remove | Friend picker in plan creation |
| Event read (list + detail + search) | Home feed, event details, search |
| Venue read (list + detail + by-event) | Venue screen, event details |
| Event interest toggle | "интересно" button |
| Event save toggle | ☆/★ toggle |
| Plan CRUD | Create, read, list (active/past) |
| Plan lifecycle (finalize, unfinalize, cancel, complete) | Creator actions |
| Plan participants (invite, update status, leave) | Coordination core |
| Plan proposals (create) | "Предложить место/время" |
| Plan proposal votes (vote, unvote) | Voting on proposals |
| Plan finalization by proposal selection | Creator picks winning proposal |
| Plan messages (list, send) | Chat tab |
| Invitations (list, accept, decline) | Plans Hub Приглашения |
| Groups (create, read, list, add member) | Plans Hub Группы |
| Notifications (list, mark read, mark all read) | Notification center |
| Social proof (friends interested, friends plan count per event) | Home feed cards |
| Repeat plan (clone participants + activity type) | "Повторить" on past plans |

## 2. Deferred Backend Scope (LATER)

| Capability | Reason |
|---|---|
| WebSocket real-time (chat, votes, proposals, notifications) | Implemented — push-only, REST is source of truth |
| Push notifications | Requires FCM/APNs setup |
| Event time change → auto-update linked plans | Requires event ingestion pipeline |
| Event cancelled → banner in linked plans | Requires event ingestion pipeline |
| Auto-complete plan at confirmed_time + 4h | Requires scheduled jobs |
| Avatar upload (S3) | Media infra |
| Image upload in chat | Rich media deferred |
| Device calendar sync | Post-MVP feature |
| Map search | Post-MVP feature |
| Deep linking / sharing | Post-MVP feature |
| User search (by username/name) | Post-MVP feature |
| Block/report users | Moderation deferred |
| Venue admin panel | System-managed in MVP |
| Venue subscription/follow | Post-MVP feature |
| Pre-meet proposals/voting | Post-MVP feature |
| Ownership transfer | Post-MVP feature |
| Admin roles beyond creator | Post-MVP feature |

---

## 3. Final MVP Domain Model

### users
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| phone | varchar(20) UNIQUE | E.164 format |
| name | varchar(100) | |
| username | varchar(50) UNIQUE | |
| avatar_url | text NULL | |
| created_at | timestamptz | |

### friendships
Bidirectional. One row per pair, normalized so `requester_id < addressee_id` always.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| requester_id | uuid FK→users | |
| addressee_id | uuid FK→users | |
| status | enum(pending, accepted) | |
| created_at | timestamptz | |

UNIQUE(requester_id, addressee_id). Index on addressee_id for "my friends" queries.

### venues
System-managed. No user writes.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | varchar(200) | |
| description | text | |
| address | varchar(300) | |
| lat | decimal(9,6) | |
| lng | decimal(9,6) | |
| cover_image_url | text | |
| created_at | timestamptz | |

### events
System-managed. No user writes.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid FK→venues | |
| title | varchar(200) | |
| description | text | |
| cover_image_url | text | |
| starts_at | timestamptz | |
| ends_at | timestamptz | |
| category | enum(music, theatre, exhibition, sport, food, party, workshop, other) | |
| tags | text[] | |
| price_info | varchar(100) NULL | |
| external_url | text NULL | |
| created_at | timestamptz | |

Index on starts_at DESC (feed), category (filter), tags GIN (search).

### event_interests

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| event_id | uuid FK→events | |
| created_at | timestamptz | |

UNIQUE(user_id, event_id). Index on event_id (social proof).

### saved_events

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| event_id | uuid FK→events | |
| created_at | timestamptz | |

UNIQUE(user_id, event_id).

### plans

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| creator_id | uuid FK→users | |
| title | varchar(200) | |
| activity_type | enum(cinema, coffee, bar, walk, dinner, sport, exhibition, other) | |
| linked_event_id | uuid FK→events NULL | |
| place_status | enum(confirmed, proposed, undecided) | |
| time_status | enum(confirmed, proposed, undecided) | |
| confirmed_place_text | varchar(300) NULL | |
| confirmed_place_lat | decimal(9,6) NULL | |
| confirmed_place_lng | decimal(9,6) NULL | |
| confirmed_time | timestamptz NULL | |
| lifecycle_state | enum(active, finalized, completed, cancelled) | |
| pre_meet_enabled | boolean DEFAULT false | |
| pre_meet_place_text | varchar(300) NULL | |
| pre_meet_time | timestamptz NULL | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Index on creator_id, lifecycle_state, linked_event_id.

### plan_participants

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| plan_id | uuid FK→plans ON DELETE CASCADE | |
| user_id | uuid FK→users | |
| status | enum(invited, going, thinking, cant) | |
| joined_at | timestamptz | |

UNIQUE(plan_id, user_id). CHECK: count per plan_id ≤ 15. Index on user_id (Plans Hub).

### plan_proposals

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| plan_id | uuid FK→plans ON DELETE CASCADE | |
| proposer_id | uuid FK→users | |
| type | enum(place, time) | |
| value_text | varchar(300) | |
| value_lat | decimal(9,6) NULL | |
| value_lng | decimal(9,6) NULL | |
| value_datetime | timestamptz NULL | |
| status | enum(active, finalized, superseded) | |
| created_at | timestamptz | |

Index on plan_id, type, status.

### votes

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| proposal_id | uuid FK→plan_proposals ON DELETE CASCADE | |
| voter_id | uuid FK→users | |
| created_at | timestamptz | |

UNIQUE(proposal_id, voter_id). CHECK: max 2 rows per (voter_id, plan_proposals.plan_id, plan_proposals.type).

### groups

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| creator_id | uuid FK→users | |
| name | varchar(100) | |
| avatar_url | text NULL | |
| created_at | timestamptz | |

Index on creator_id.

### group_members

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK→groups ON DELETE CASCADE | |
| user_id | uuid FK→users | |
| role | enum(member) | MVP: member only |
| joined_at | timestamptz | |

UNIQUE(group_id, user_id).

### invitations

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| type | enum(plan, group) | |
| target_id | uuid | FK polymorphic — plan_id or group_id |
| inviter_id | uuid FK→users | |
| invitee_id | uuid FK→users | |
| status | enum(pending, accepted, declined) | |
| created_at | timestamptz | |

UNIQUE(type, target_id, invitee_id). Index on invitee_id + status (pending list).

### notifications

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| type | enum(plan_invite, group_invite, proposal_created, plan_finalized, plan_unfinalized, event_time_changed, event_cancelled, plan_reminder, plan_completed) | |
| payload | jsonb | Structured per type |
| read | boolean DEFAULT false | |
| created_at | timestamptz | |

Index on user_id + read (unread count), created_at DESC (list).

### messages

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| context_type | enum(plan) | MVP: plan only |
| context_id | uuid FK→plans | |
| sender_id | uuid FK→users | |
| text | text | |
| type | enum(user, system, proposal_card) | |
| reference_id | uuid NULL | FK→plan_proposals when type=proposal_card |
| created_at | timestamptz | |

Index on context_id + created_at. CHECK: type='proposal_card' ⇒ reference_id IS NOT NULL.

---

## 4. PostgreSQL Schema Proposal

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE event_category AS ENUM ('music','theatre','exhibition','sport','food','party','workshop','other');
CREATE TYPE activity_type AS ENUM ('cinema','coffee','bar','walk','dinner','sport','exhibition','other');
CREATE TYPE friendship_status AS ENUM ('pending','accepted');
CREATE TYPE place_status AS ENUM ('confirmed','proposed','undecided');
CREATE TYPE time_status AS ENUM ('confirmed','proposed','undecided');
CREATE TYPE plan_lifecycle AS ENUM ('active','finalized','completed','cancelled');
CREATE TYPE participant_status AS ENUM ('invited','going','thinking','cant');
CREATE TYPE proposal_type AS ENUM ('place','time');
CREATE TYPE proposal_status AS ENUM ('active','finalized','superseded');
CREATE TYPE group_role AS ENUM ('member');
CREATE TYPE invitation_type AS ENUM ('plan','group');
CREATE TYPE invitation_status AS ENUM ('pending','accepted','declined');
CREATE TYPE notification_type AS ENUM ('plan_invite','group_invite','proposal_created','plan_finalized','plan_unfinalized','event_time_changed','event_cancelled','plan_reminder','plan_completed','friend_request','plan_join_via_link');
CREATE TYPE message_type AS ENUM ('user','system','proposal_card');
CREATE TYPE message_context AS ENUM ('plan');

-- Tables
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone varchar(20) UNIQUE NOT NULL,
  name varchar(100) NOT NULL,
  username varchar(50) UNIQUE NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE friendships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id uuid NOT NULL REFERENCES users(id),
  addressee_id uuid NOT NULL REFERENCES users(id),
  status friendship_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendship_unique UNIQUE (requester_id, addressee_id),
  CONSTRAINT friendship_order CHECK (requester_id != addressee_id)
);
CREATE INDEX idx_friendships_addressee ON friendships (addressee_id) WHERE status = 'accepted';
CREATE INDEX idx_friendships_requester ON friendships (requester_id) WHERE status = 'accepted';

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(200) NOT NULL,
  description text NOT NULL DEFAULT '',
  address varchar(300) NOT NULL,
  lat decimal(9,6) NOT NULL,
  lng decimal(9,6) NOT NULL,
  cover_image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  title varchar(200) NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_image_url text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  category event_category NOT NULL DEFAULT 'other',
  tags text[] NOT NULL DEFAULT '{}',
  price_info varchar(100),
  external_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_starts_at ON events (starts_at DESC);
CREATE INDEX idx_events_category ON events (category);
CREATE INDEX idx_events_tags ON events USING GIN (tags);

CREATE TABLE event_interests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_interest_unique UNIQUE (user_id, event_id)
);
CREATE INDEX idx_event_interests_event ON event_interests (event_id);

CREATE TABLE saved_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_event_unique UNIQUE (user_id, event_id)
);

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id uuid NOT NULL REFERENCES users(id),
  title varchar(200) NOT NULL,
  activity_type activity_type NOT NULL DEFAULT 'other',
  linked_event_id uuid REFERENCES events(id),
  place_status place_status NOT NULL DEFAULT 'undecided',
  time_status time_status NOT NULL DEFAULT 'undecided',
  confirmed_place_text varchar(300),
  confirmed_place_lat decimal(9,6),
  confirmed_place_lng decimal(9,6),
  confirmed_time timestamptz,
  lifecycle_state plan_lifecycle NOT NULL DEFAULT 'active',
  pre_meet_enabled boolean NOT NULL DEFAULT false,
  pre_meet_place_text varchar(300),
  pre_meet_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plans_creator ON plans (creator_id);
CREATE INDEX idx_plans_lifecycle ON plans (lifecycle_state);
CREATE INDEX idx_plans_event ON plans (linked_event_id) WHERE linked_event_id IS NOT NULL;

CREATE TABLE plan_participants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  status participant_status NOT NULL DEFAULT 'invited',
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT participant_unique UNIQUE (plan_id, user_id)
);
CREATE INDEX idx_participants_user ON plan_participants (user_id);

CREATE TABLE plan_proposals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  proposer_id uuid NOT NULL REFERENCES users(id),
  type proposal_type NOT NULL,
  value_text varchar(300) NOT NULL,
  value_lat decimal(9,6),
  value_lng decimal(9,6),
  value_datetime timestamptz,
  status proposal_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposals_plan ON plan_proposals (plan_id, type, status);

CREATE TABLE votes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id uuid NOT NULL REFERENCES plan_proposals(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vote_unique UNIQUE (proposal_id, voter_id)
);
-- Max 2 votes per user per proposal type per plan — enforced at application layer

CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id uuid NOT NULL REFERENCES users(id),
  name varchar(100) NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  role group_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_member_unique UNIQUE (group_id, user_id)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type invitation_type NOT NULL,
  target_id uuid NOT NULL,
  inviter_id uuid NOT NULL REFERENCES users(id),
  invitee_id uuid NOT NULL REFERENCES users(id),
  status invitation_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitation_unique UNIQUE (type, target_id, invitee_id)
);
CREATE INDEX idx_invitations_invitee ON invitations (invitee_id, status);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications (user_id, read) WHERE read = false;
CREATE INDEX idx_notifications_user_list ON notifications (user_id, created_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_type message_context NOT NULL DEFAULT 'plan',
  context_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  text text NOT NULL DEFAULT '',
  type message_type NOT NULL DEFAULT 'user',
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_card_has_ref CHECK (type != 'proposal_card' OR reference_id IS NOT NULL)
);
CREATE INDEX idx_messages_context ON messages (context_id, created_at);
```

---

## 5. OpenAPI Endpoint Proposal

### Auth

```
POST /auth/otp/send
  body: { phone: string }
  response: 200 { }

POST /auth/otp/verify
  body: { phone: string, code: string }
  response: 200 { access_token: string, refresh_token: string, user: User }

POST /auth/refresh
  body: { refresh_token: string }
  response: 200 { access_token: string, refresh_token: string }

GET /auth/me
  response: 200 { user: User }
```

### Users

```
GET /users/me
  response: 200 { user: User }

PATCH /users/me
  body: { name?: string, username?: string, avatar_url?: string }
  response: 200 { user: User }

GET /users/:id
  response: 200 { user: User }

GET /users/friends
  query: ?status=accepted
  response: 200 { friends: User[] }

POST /users/friends/:id
  response: 201 { friendship: Friendship }
  side-effects: inserts a ‘pending’ friendship (or auto-accepts if the other
                user had already sent a pending request); creates a
                ‘friend_request’ notification for the addressee.

PATCH /users/friends/:id
  body: { action: 'accept' | 'decline' }
  response: 200 { friendship: Friendship } on accept, 204 on decline
  auth: only the addressee of a pending request may call this.

DELETE /users/friends/:id
  response: 204

GET /users/search
  query: ?q=<substring>&limit=20  (q required, 1<=limit<=50)
  response: 200 { users: (User & { friendship_status: 'friend' | 'request_sent' | 'request_received' | null })[] }
  description: case-insensitive match on name/username; current viewer
               excluded; friendship_status reflects the viewer's relationship
               with each returned user.
```

### Events

```
GET /events
  query: ?category=...&tags=...&date_from=...&date_to=...&page=...&limit=20
  response: 200 { events: EventWithSocial[], total: number }
  EventWithSocial = Event & { venue: Venue, friends_interested: User[], friends_plan_count: number }

GET /events/:id
  response: 200 { event: EventWithSocial }

POST /events/:id/interest
  response: 200 { }

DELETE /events/:id/interest
  response: 204

POST /events/:id/save
  response: 200 { }

DELETE /events/:id/save
  response: 204
```

### Venues

```
GET /venues/:id
  response: 200 { venue: Venue }

GET /venues/:id/events
  query: ?page=...&limit=20
  response: 200 { events: Event[], total: number }
```

### Plans

```
GET /plans
  query: ?lifecycle=active|finalized|completed|cancelled&participant=me&page=...&limit=20
  response: 200 { plans: PlanWithParticipants[], total: number }

POST /plans
  body: {
    title: string,
    activity_type: ActivityType,
    linked_event_id?: string,
    confirmed_place_text?: string,
    confirmed_place_lat?: number,
    confirmed_place_lng?: number,
    confirmed_time?: string,
    pre_meet_enabled?: boolean,
    pre_meet_place_text?: string,
    pre_meet_time?: string,
    participant_ids: string[]
  }
  response: 201 { plan: PlanFull }
  side-effects: creates plan_participants (creator=going, others=invited),
                creates invitations (type=plan) for each participant_id != creator,
                creates notifications (type=plan_invite) for each invitee,
                creates system message "План создан"

GET /plans/:id
  response: 200 { plan: PlanFull }
  PlanFull = Plan & { participants: PlanParticipantWithUser[], proposals: ProposalWithVotes[], linked_event?: Event }

PATCH /plans/:id
  body: { pre_meet_enabled?: boolean, pre_meet_place_text?: string, pre_meet_time?: string }
  response: 200 { plan: PlanFull }
  auth: creator only

POST /plans/:id/finalize
  body: { place_proposal_id?: string, time_proposal_id?: string }
  response: 200 { plan: PlanFull }
  auth: creator only
  side-effects: sets lifecycle_state=finalized,
                updates confirmed_place/time from selected proposals,
                superseded proposals get status=superseded,
                creates notifications (type=plan_finalized) for all participants

POST /plans/:id/unfinalize
  response: 200 { plan: PlanFull }
  auth: creator only
  side-effects: sets lifecycle_state=active,
                superseded proposals revert to active,
                creates notifications (type=plan_unfinalized)

POST /plans/:id/cancel
  response: 200 { plan: PlanFull }
  auth: creator only
  side-effects: sets lifecycle_state=cancelled

POST /plans/:id/complete
  response: 200 { plan: PlanFull }
  auth: creator only
  side-effects: sets lifecycle_state=completed

POST /plans/:id/repeat
  response: 201 { plan: PlanFull }
  side-effects: clones plan with same participants (status=invited) and activity_type,
                place_status=undecided, time_status=undecided,
                creates new invitations + notifications
```

### Plan Share Links

```
GET /plans/by-token/:token
  auth: none (public preview)
  response: 200 { plan: PlanSharePreview }
  PlanSharePreview = {
    id, title, activity_type, lifecycle_state,
    confirmed_place_text, confirmed_time, share_token,
    creator: User | null, participant_count, max_participants
  }
  404 if no plan has that share_token.

POST /plans/by-token/:token/join
  auth: bearer
  response: 200 { already_joined: boolean, plan: PlanFull }
  side-effects: adds caller as 'going' participant (FOR UPDATE lock,
                15-participant cap); creates 'plan_join_via_link'
                notification for the creator. If the caller was already
                a participant, returns already_joined=true and does not
                re-insert or re-notify.
  400 INVALID_STATE  if plan is cancelled or completed.
  404 NOT_FOUND      if the token does not match any plan.
  409 PLAN_FULL      if plan already has 15 participants.
```

### Plan Participants

```
GET /plans/:id/participants
  response: 200 { participants: PlanParticipantWithUser[] }

PATCH /plans/:id/participants/:uid
  body: { status: going|thinking|cant }
  response: 200 { participant: PlanParticipantWithUser }
  auth: :uid must be self (user updates own status), or creator can update any

DELETE /plans/:id/participants/:uid
  response: 204
  auth: :uid must be self (leave), or creator can remove any
```

### Proposals

```
POST /plans/:id/proposals
  body: { type: place|time, value_text: string, value_lat?: number, value_lng?: number, value_datetime?: string }
  response: 201 { proposal: ProposalWithVotes }
  side-effects: sets plan place_status/time_status to 'proposed' if was 'undecided',
                creates proposal_card message in plan chat,
                creates notifications (type=proposal_created) for other participants

GET /plans/:id/proposals
  query: ?type=place|time&status=active
  response: 200 { proposals: ProposalWithVotes[] }
```

### Votes

```
POST /plans/:id/proposals/:pid/vote
  response: 200 { vote: Vote }
  constraint: max 2 active votes per user per proposal type per plan — 409 if exceeded

DELETE /plans/:id/proposals/:pid/vote
  response: 204
```

### Messages

```
GET /plans/:id/messages
  query: ?before=iso&limit=50
  response: 200 { messages: MessageWithSender[] }

POST /plans/:id/messages
  body: { text: string, client_message_id?: string }
  response: 201 { message: MessageWithSender }
  side-effects: broadcasts `plan.message.created` to plan channel
```

### Invitations

```
GET /invitations
  query: ?status=pending
  response: 200 { invitations: InvitationWithTarget[] }
  InvitationWithTarget = Invitation & { plan?: PlanStub, group?: GroupStub }

PATCH /invitations/:id
  body: { status: accepted|declined }
  response: 200 { invitation: Invitation }
  side-effects on accept(type=plan): creates plan_participant (status=going),
                                      creates system message "N принял(а) приглашение"
  side-effects on accept(type=group): creates group_member
```

### Groups

```
GET /groups
  response: 200 { groups: GroupWithMemberCount[] }

POST /groups
  body: { name: string, member_ids: string[] }
  response: 201 { group: GroupWithMembers }
  side-effects: creates group_members, creates invitations (type=group) + notifications

GET /groups/:id
  response: 200 { group: GroupWithMembers }
  GroupWithMembers = Group & { members: GroupMemberWithUser[] }

POST /groups/:id/members
  body: { user_id: string }
  response: 200 { member: GroupMemberWithUser }
  auth: creator only
  side-effects: creates invitation (type=group) + notification

DELETE /groups/:id/members/:uid
  response: 204
  auth: creator only, or :uid = self (leave)
```

### Search

```
GET /search/events
  query: ?q=...&category=...&date_from=...&date_to=...&page=...&limit=20
  response: 200 { events: EventWithSocial[], total: number }
```

### Notifications

```
GET /notifications
  query: ?page=...&limit=50
  response: 200 { notifications: Notification[], unread_count: number }

PATCH /notifications/:id/read
  response: 200 { notification: Notification }

PATCH /notifications/read-all
  response: 200 { }
```

---

## 6. Screen-to-Endpoint Mapping

| Screen | Endpoint(s) | Optimistic | Server-confirmed |
|---|---|---|---|
| AuthScreen | POST /auth/otp/send, POST /auth/otp/verify | — | verify |
| HomeScreen | GET /events (with social proof), POST/DELETE /events/:id/interest, POST/DELETE /events/:id/save | interest, save | — |
| EventDetailsScreen | GET /events/:id | — | — |
| SearchScreen | GET /search/events | — | — |
| VenueScreen | GET /venues/:id, GET /venues/:id/events | — | — |
| CreatePlanScreen | GET /users/friends, GET /groups, POST /plans | — | POST /plans (plan+participants+invitations created atomically) |
| CreatePlanFromEventScreen | GET /events/:id, GET /users/friends, GET /groups, POST /plans | — | POST /plans |
| PlansHubScreen | GET /plans (lifecycle=active\|finalized), GET /plans (lifecycle=completed), GET /invitations (status=pending), GET /groups | — | — |
| PlanDetailsScreen (details) | GET /plans/:id, PATCH /plans/:id/participants/:uid (status), POST /plans/:id/proposals, POST/DELETE /plans/:id/proposals/:pid/vote, POST /plans/:id/finalize, POST /plans/:id/unfinalize, POST /plans/:id/cancel, POST /plans/:id/repeat | vote, unvote | participant status, proposal, finalize, unfinalize, cancel, repeat |
| PlanDetailsScreen (chat) | GET /plans/:id/messages, POST /plans/:id/messages | message send | — |
| GroupDetailsScreen | GET /groups/:id, POST /groups/:id/members, DELETE /groups/:id/members/:uid, POST /plans (via "Создать план с группой") | — | all |
| NotificationsScreen | GET /notifications, PATCH /notifications/:id/read, PATCH /notifications/read-all | — | — |
| ProfileScreen | GET /users/me, PATCH /users/me, GET /events (saved only), DELETE /auth/me (logout) | — | profile edit |

### Optimistic write rules

- **interest/save toggle**: fire-and-forget DELETE or POST. Rollback on error.
- **vote/unvote**: immediate UI update. 409 on max-votes-exceeded → rollback.
- **message send**: append to local list immediately. On failure, mark as failed.
- **All lifecycle changes**: must be server-confirmed before UI transitions state.

---

## 7. Backend Slice Order

### Slice 1: Read-only + minimal writes
**Goal**: App can log in, browse events, view profiles.

Endpoints:
- POST /auth/otp/send
- POST /auth/otp/verify
- POST /auth/refresh
- GET /auth/me
- GET /users/me
- PATCH /users/me
- GET /users/:id
- GET /users/friends
- GET /events (with social proof)
- GET /events/:id
- GET /venues/:id
- GET /venues/:id/events
- GET /search/events
- POST/DELETE /events/:id/interest
- POST/DELETE /events/:id/save

Tables: users, venues, events, event_interests, saved_events, friendships

No real-time. REST only. Events/venues seeded via migration or admin script.

### Slice 2: Plan lifecycle + invitations + statuses
**Goal**: Full plan creation, invitation flow, status updates, lifecycle transitions.

Endpoints:
- POST /plans
- GET /plans (with filters)
- GET /plans/:id
- PATCH /plans/:id
- POST /plans/:id/cancel
- POST /plans/:id/complete
- GET /plans/:id/participants
- PATCH /plans/:id/participants/:uid
- DELETE /plans/:id/participants/:uid
- GET /invitations
- PATCH /invitations/:id
- GET /groups
- POST /groups
- GET /groups/:id
- POST /groups/:id/members
- DELETE /groups/:id/members/:uid
- GET /notifications
- PATCH /notifications/:id/read
- PATCH /notifications/read-all
- POST /plans/:id/repeat

Tables: plans, plan_participants, invitations, groups, group_members, notifications

Side-effects: invitation accept creates participant + notification. Plan create creates participants + invitations + system message.

### Slice 3: Proposals + voting + notification generation
**Goal**: Full coordination loop — propose, vote, finalize.

Endpoints:
- POST /plans/:id/proposals
- GET /plans/:id/proposals
- POST /plans/:id/proposals/:pid/vote
- DELETE /plans/:id/proposals/:pid/vote
- POST /plans/:id/finalize
- POST /plans/:id/unfinalize

Tables: plan_proposals, votes

Side-effects: proposal creates notification + proposal_card message. Finalize sets confirmed data + supersedes losers + notification. Vote constraint: max 2 per type per user per plan.

### Slice 4: Chat + realtime — DONE
**Goal**: Messages work. WebSocket pushes updates.

Endpoints:
- GET /plans/:id/messages
- POST /plans/:id/messages

Tables: messages (already exists)

Real-time implementation:
- Backend: `@fastify/websocket` at `/api/ws` — auth via JWT, subscribe/unsubscribe channels
- Channels: `user:{userId}` (notifications), `plan:{planId}` (messages, proposals, votes, lifecycle)
- WS events: `plan.message.created`, `plan.proposal.created`, `plan.vote.changed`, `plan.finalized`, `plan.unfinalized`, `notification.created`
- Frontend: singleton WS client with reconnect + resync + heartbeat/stale detection
- Dedup: `client_message_id` reconciliation for messages, ID check for proposals, optimistic vote filtering
- REST remains source of truth — WS is push-only, no transactional writes

Missing WS events (not yet emitted): `plan.cancelled`, `plan.completed`, participant add/remove/update

Optimistic message send with server confirmation. No message edit/delete in MVP.

---

**Total: 4 slices. All 4 implemented.**
