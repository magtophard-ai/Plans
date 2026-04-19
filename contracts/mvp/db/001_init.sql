-- MVP Initial Schema: Планы? / Fest&Rest
-- PostgreSQL 15+
-- Matches: contracts/mvp/api/openapi.yaml, docs/backend-contract.md

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE event_category AS ENUM (
  'music', 'theatre', 'exhibition', 'sport', 'food', 'party', 'workshop', 'other'
);

CREATE TYPE activity_type AS ENUM (
  'cinema', 'coffee', 'bar', 'walk', 'dinner', 'sport', 'exhibition', 'other'
);

CREATE TYPE friendship_status AS ENUM (
  'pending', 'accepted'
);

CREATE TYPE place_status AS ENUM (
  'confirmed', 'proposed', 'undecided'
);

CREATE TYPE time_status AS ENUM (
  'confirmed', 'proposed', 'undecided'
);

CREATE TYPE plan_lifecycle AS ENUM (
  'active', 'finalized', 'completed', 'cancelled'
);

CREATE TYPE participant_status AS ENUM (
  'invited', 'going', 'thinking', 'cant'
);

CREATE TYPE proposal_type AS ENUM (
  'place', 'time'
);

CREATE TYPE proposal_status AS ENUM (
  'active', 'finalized', 'superseded'
);

CREATE TYPE group_role AS ENUM (
  'member'
);

CREATE TYPE invitation_type AS ENUM (
  'plan', 'group'
);

CREATE TYPE invitation_status AS ENUM (
  'pending', 'accepted', 'declined'
);

CREATE TYPE notification_type AS ENUM (
  'plan_invite', 'group_invite', 'proposal_created',
  'plan_finalized', 'plan_unfinalized',
  'event_time_changed', 'event_cancelled',
  'plan_reminder', 'plan_completed'
);

CREATE TYPE message_type AS ENUM (
  'user', 'system', 'proposal_card'
);

CREATE TYPE message_context AS ENUM (
  'plan'
);

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       varchar(20) UNIQUE NOT NULL,
  name        varchar(100) NOT NULL,
  username    varchar(50) UNIQUE NOT NULL,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE friendships (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id  uuid NOT NULL REFERENCES users(id),
  addressee_id  uuid NOT NULL REFERENCES users(id),
  status        friendship_status NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendship_unique UNIQUE (requester_id, addressee_id),
  CONSTRAINT friendship_no_self CHECK (requester_id != addressee_id)
);
CREATE INDEX idx_friendships_addressee ON friendships (addressee_id) WHERE status = 'accepted';
CREATE INDEX idx_friendships_requester ON friendships (requester_id) WHERE status = 'accepted';

CREATE TABLE venues (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            varchar(200) NOT NULL,
  description     text NOT NULL DEFAULT '',
  address         varchar(300) NOT NULL,
  lat             decimal(9,6) NOT NULL,
  lng             decimal(9,6) NOT NULL,
  cover_image_url text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id        uuid NOT NULL REFERENCES venues(id),
  title           varchar(200) NOT NULL,
  description     text NOT NULL DEFAULT '',
  cover_image_url text NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  category        event_category NOT NULL DEFAULT 'other',
  tags            text[] NOT NULL DEFAULT '{}',
  price_info      varchar(100),
  external_url    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_starts_at ON events (starts_at DESC);
CREATE INDEX idx_events_category  ON events (category);
CREATE INDEX idx_events_tags      ON events USING GIN (tags);

CREATE TABLE event_interests (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_interest_unique UNIQUE (user_id, event_id)
);
CREATE INDEX idx_event_interests_event ON event_interests (event_id);

CREATE TABLE saved_events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_event_unique UNIQUE (user_id, event_id)
);

CREATE TABLE plans (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id            uuid NOT NULL REFERENCES users(id),
  title                 varchar(200) NOT NULL,
  activity_type          activity_type NOT NULL DEFAULT 'other',
  linked_event_id        uuid REFERENCES events(id),
  place_status          place_status NOT NULL DEFAULT 'undecided',
  time_status           time_status NOT NULL DEFAULT 'undecided',
  confirmed_place_text   varchar(300),
  confirmed_place_lat    decimal(9,6),
  confirmed_place_lng    decimal(9,6),
  confirmed_time         timestamptz,
  lifecycle_state        plan_lifecycle NOT NULL DEFAULT 'active',
  pre_meet_enabled       boolean NOT NULL DEFAULT false,
  pre_meet_place_text    varchar(300),
  pre_meet_time          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plans_creator   ON plans (creator_id);
CREATE INDEX idx_plans_lifecycle ON plans (lifecycle_state);
CREATE INDEX idx_plans_event     ON plans (linked_event_id) WHERE linked_event_id IS NOT NULL;

CREATE TABLE plan_participants (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id     uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  status      participant_status NOT NULL DEFAULT 'invited',
  joined_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT participant_unique UNIQUE (plan_id, user_id)
);
CREATE INDEX idx_participants_user ON plan_participants (user_id);

CREATE TABLE plan_proposals (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id         uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  proposer_id     uuid NOT NULL REFERENCES users(id),
  type            proposal_type NOT NULL,
  value_text      varchar(300) NOT NULL,
  value_lat       decimal(9,6),
  value_lng       decimal(9,6),
  value_datetime  timestamptz,
  status          proposal_status NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposals_plan ON plan_proposals (plan_id, type, status);

CREATE TABLE votes (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id   uuid NOT NULL REFERENCES plan_proposals(id) ON DELETE CASCADE,
  voter_id      uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vote_unique UNIQUE (proposal_id, voter_id)
);

CREATE TABLE groups (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id  uuid NOT NULL REFERENCES users(id),
  name        varchar(100) NOT NULL,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_groups_creator ON groups (creator_id);

CREATE TABLE group_members (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  role        group_role NOT NULL DEFAULT 'member',
  joined_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_member_unique UNIQUE (group_id, user_id)
);

CREATE TABLE invitations (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        invitation_type NOT NULL,
  target_id   uuid NOT NULL,
  inviter_id  uuid NOT NULL REFERENCES users(id),
  invitee_id  uuid NOT NULL REFERENCES users(id),
  status      invitation_status NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitation_unique UNIQUE (type, target_id, invitee_id)
);
CREATE INDEX idx_invitations_invitee ON invitations (invitee_id, status);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications (user_id, read) WHERE read = false;
CREATE INDEX idx_notifications_user_list  ON notifications (user_id, created_at DESC);

CREATE TABLE messages (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_type   message_context NOT NULL DEFAULT 'plan',
  context_id     uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  sender_id      uuid NOT NULL REFERENCES users(id),
  text           text NOT NULL DEFAULT '',
  type           message_type NOT NULL DEFAULT 'user',
  reference_id   uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_card_has_ref CHECK (type != 'proposal_card' OR reference_id IS NOT NULL)
);
CREATE INDEX idx_messages_context ON messages (context_id, created_at);

-- ============================================================
-- APPLICATION-LAYER CONSTRAINTS (enforced in code, not SQL)
-- ============================================================
-- 1. Max 15 participants per plan (plan_participants count by plan_id)
-- 2. Max 2 votes per user per proposal_type per plan (votes joined with plan_proposals)
-- 3. Only plan creator can finalize/unfinalize/cancel/invite
-- 4. Only group creator can add members to group

COMMIT;
