ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'plan_invite';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'group_invite';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'proposal_created';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'plan_finalized';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'plan_unfinalized';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_time_changed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_cancelled';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'plan_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'plan_completed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'friend_request';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'friend_accepted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'plan_join_via_link';

ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id text;

CREATE TABLE IF NOT EXISTS event_ingestions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type text NOT NULL,
  source_url text,
  source_event_key text,
  raw_payload jsonb NOT NULL,
  title varchar(200) NOT NULL,
  description text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  venue_name varchar(200) NOT NULL,
  address varchar(300) NOT NULL,
  cover_image_url text NOT NULL,
  external_url text,
  category event_category NOT NULL DEFAULT 'other',
  tags text[] NOT NULL DEFAULT '{}',
  price_info varchar(100),
  fingerprint text NOT NULL,
  state text NOT NULL DEFAULT 'imported',
  linked_event_id uuid REFERENCES events(id),
  duplicate_of_event_id uuid REFERENCES events(id),
  operator_note text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_ingestions_state_check CHECK (state IN ('imported', 'duplicate', 'published', 'cancelled')),
  CONSTRAINT event_ingestions_unique_source UNIQUE (source_type, source_event_key)
);

CREATE INDEX IF NOT EXISTS idx_event_ingestions_state_updated ON event_ingestions (state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_ingestions_fingerprint ON event_ingestions (fingerprint);
CREATE INDEX IF NOT EXISTS idx_event_ingestions_linked_event ON event_ingestions (linked_event_id) WHERE linked_event_id IS NOT NULL;

ALTER TABLE events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_event_key text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_fingerprint text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS last_ingested_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE INDEX IF NOT EXISTS idx_events_status_starts_at ON events (status, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_source_fingerprint ON events (source_fingerprint) WHERE source_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source_key_unique ON events (source_type, source_event_key) WHERE source_event_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_share_token_unique ON plans (share_token);

UPDATE plans
SET share_token = substring(replace(id::text, '-', '') for 16)
WHERE share_token IS NULL;
