INSERT INTO users (phone, name, username)
VALUES
  ('+79990000000', 'Я', 'me'),
  ('+79991111111', 'Маша', 'masha'),
  ('+79992222222', 'Дима', 'dima'),
  ('+79993333333', 'Лена', 'lena'),
  ('+79994444444', 'Артём', 'artem'),
  ('+79995555555', 'Катя', 'katya')
ON CONFLICT (phone) DO UPDATE
SET name = EXCLUDED.name,
    username = EXCLUDED.username;

INSERT INTO friendships (requester_id, addressee_id, status)
SELECT LEAST(a.id, b.id), GREATEST(a.id, b.id), 'accepted'::friendship_status
FROM (VALUES
  ('+79990000000', '+79991111111'),
  ('+79990000000', '+79992222222'),
  ('+79990000000', '+79993333333'),
  ('+79990000000', '+79994444444'),
  ('+79990000000', '+79995555555'),
  ('+79991111111', '+79992222222'),
  ('+79992222222', '+79993333333')
) pairs(a_phone, b_phone)
JOIN users a ON a.phone = pairs.a_phone
JOIN users b ON b.phone = pairs.b_phone
ON CONFLICT (requester_id, addressee_id) DO UPDATE
SET status = EXCLUDED.status;

INSERT INTO venues (id, name, description, address, lat, lng, cover_image_url)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Музей современного искусства', 'Крупнейший музей', 'ул. Гоголя, 15', 55.7558, 37.6173, 'https://placehold.co/600x400/6C5CE7/white?text=Museum'),
  ('22222222-2222-4222-8222-222222222222', 'Бар «Ночь»', 'Коктейль-бар', 'ул. Тверская, 22', 55.765, 37.605, 'https://placehold.co/600x400/FD79A8/white?text=Bar'),
  ('33333333-3333-4333-8333-333333333333', 'Кинотеатр «Иллюзион»', 'Артхаус', 'Кутузовский пр., 8', 55.74, 37.57, 'https://placehold.co/600x400/00B894/white?text=Cinema'),
  ('44444444-4444-4444-8444-444444444444', 'Стадион «Центральный»', 'Спорт', 'Лужники', 55.715, 37.555, 'https://placehold.co/600x400/74B9FF/white?text=Stadium'),
  ('55555555-5555-4555-8555-555555555555', 'Галерея «Новый взгляд»', 'Молодые художники', 'Патриаршие, 3', 55.76, 37.59, 'https://placehold.co/600x400/FDCB6E/white?text=Gallery')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    cover_image_url = EXCLUDED.cover_image_url;

INSERT INTO events (id, venue_id, title, description, cover_image_url, starts_at, ends_at, category, tags, price_info)
VALUES
  ('61111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Ретроспектива Кабакова', 'Масштабная выставка', 'https://placehold.co/600x400/6C5CE7/white?text=Kabakov', '2026-04-25T10:00:00+03:00', '2026-04-25T20:00:00+03:00', 'exhibition', ARRAY['искусство'], '500 ₽'),
  ('62222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'Джазовый вечер', 'Живой джаз', 'https://placehold.co/600x400/FD79A8/white?text=Jazz', '2026-04-22T20:00:00+03:00', '2026-04-23T02:00:00+03:00', 'music', ARRAY['джаз'], 'Вход свободный'),
  ('63333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'Фестиваль японского кино', 'Куросава, Мидзогути, Одзу', 'https://placehold.co/600x400/00B894/white?text=Japan+Cinema', '2026-04-26T14:00:00+03:00', '2026-04-26T22:00:00+03:00', 'other', ARRAY['кино'], '350 ₽'),
  ('64444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', 'Дерби: Спартак — Динамо', 'Главный матч тура', 'https://placehold.co/600x400/74B9FF/white?text=Derby', '2026-04-27T19:00:00+03:00', '2026-04-27T21:00:00+03:00', 'sport', ARRAY['футбол'], 'от 1200 ₽'),
  ('65555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', 'Нео-импрессионизм', 'Новая выставка', 'https://placehold.co/600x400/FDCB6E/white?text=Neo-Impressionism', '2026-04-23T12:00:00+03:00', '2026-04-23T21:00:00+03:00', 'exhibition', ARRAY['живопись'], '300 ₽'),
  ('66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222', 'Techno Night', 'Ночь техно из Берлина', 'https://placehold.co/600x400/A29BFE/white?text=Techno', '2026-04-24T23:00:00+03:00', '2026-04-25T06:00:00+03:00', 'party', ARRAY['техно'], '800 ₽')
ON CONFLICT (id) DO UPDATE
SET venue_id = EXCLUDED.venue_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    cover_image_url = EXCLUDED.cover_image_url,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    category = EXCLUDED.category,
    tags = EXCLUDED.tags,
    price_info = EXCLUDED.price_info;

INSERT INTO event_interests (user_id, event_id)
SELECT u.id, e.id
FROM (VALUES
  ('+79991111111', '61111111-1111-4111-8111-111111111111'::uuid),
  ('+79992222222', '62222222-2222-4222-8222-222222222222'::uuid),
  ('+79993333333', '62222222-2222-4222-8222-222222222222'::uuid),
  ('+79994444444', '64444444-4444-4444-8444-444444444444'::uuid),
  ('+79991111111', '65555555-5555-4555-8555-555555555555'::uuid),
  ('+79995555555', '65555555-5555-4555-8555-555555555555'::uuid),
  ('+79992222222', '66666666-6666-4666-8666-666666666666'::uuid)
) rows(phone, event_id)
JOIN users u ON u.phone = rows.phone
JOIN events e ON e.id = rows.event_id
ON CONFLICT (user_id, event_id) DO NOTHING;

WITH user_ids AS (
  SELECT
    MAX(id::text) FILTER (WHERE phone = '+79990000000')::uuid AS me,
    MAX(id::text) FILTER (WHERE phone = '+79991111111')::uuid AS u1,
    MAX(id::text) FILTER (WHERE phone = '+79992222222')::uuid AS u2,
    MAX(id::text) FILTER (WHERE phone = '+79993333333')::uuid AS u3,
    MAX(id::text) FILTER (WHERE phone = '+79995555555')::uuid AS u5
  FROM users
)
INSERT INTO plans (
  id, creator_id, title, activity_type, linked_event_id, place_status, time_status,
  confirmed_place_text, confirmed_place_lat, confirmed_place_lng, confirmed_time,
  lifecycle_state, pre_meet_enabled, pre_meet_place_text, pre_meet_time
)
SELECT rows.*
FROM user_ids
CROSS JOIN LATERAL (VALUES
  ('71111111-1111-4111-8111-111111111111'::uuid, me, 'Джазовый вечер', 'bar'::activity_type, '62222222-2222-4222-8222-222222222222'::uuid, 'confirmed'::place_status, 'confirmed'::time_status, 'Бар «Ночь»', 55.765::decimal, 37.605::decimal, '2026-04-22T20:00:00+03:00'::timestamptz, 'active'::plan_lifecycle, true, 'Метро Тверская', '2026-04-22T19:30:00+03:00'::timestamptz),
  ('72222222-2222-4222-8222-222222222222'::uuid, me, 'Кино в субботу', 'cinema'::activity_type, NULL::uuid, 'proposed'::place_status, 'confirmed'::time_status, NULL, NULL::decimal, NULL::decimal, '2026-04-26T18:00:00+03:00'::timestamptz, 'active'::plan_lifecycle, false, NULL, NULL::timestamptz),
  ('73333333-3333-4333-8333-333333333333'::uuid, me, 'Выставка Кабакова', 'exhibition'::activity_type, '61111111-1111-4111-8111-111111111111'::uuid, 'confirmed'::place_status, 'confirmed'::time_status, 'Музей современного искусства', 55.7558::decimal, 37.6173::decimal, '2026-04-12T10:00:00+03:00'::timestamptz, 'completed'::plan_lifecycle, false, NULL, NULL::timestamptz)
) rows(
  id, creator_id, title, activity_type, linked_event_id, place_status, time_status,
  confirmed_place_text, confirmed_place_lat, confirmed_place_lng, confirmed_time,
  lifecycle_state, pre_meet_enabled, pre_meet_place_text, pre_meet_time
)
ON CONFLICT (id) DO UPDATE
SET creator_id = EXCLUDED.creator_id,
    title = EXCLUDED.title,
    activity_type = EXCLUDED.activity_type,
    linked_event_id = EXCLUDED.linked_event_id,
    place_status = EXCLUDED.place_status,
    time_status = EXCLUDED.time_status,
    confirmed_place_text = EXCLUDED.confirmed_place_text,
    confirmed_place_lat = EXCLUDED.confirmed_place_lat,
    confirmed_place_lng = EXCLUDED.confirmed_place_lng,
    confirmed_time = EXCLUDED.confirmed_time,
    lifecycle_state = EXCLUDED.lifecycle_state,
    pre_meet_enabled = EXCLUDED.pre_meet_enabled,
    pre_meet_place_text = EXCLUDED.pre_meet_place_text,
    pre_meet_time = EXCLUDED.pre_meet_time;

INSERT INTO plan_participants (plan_id, user_id, status)
SELECT plan_id, u.id, status::participant_status
FROM (VALUES
  ('71111111-1111-4111-8111-111111111111'::uuid, '+79990000000', 'going'),
  ('71111111-1111-4111-8111-111111111111'::uuid, '+79992222222', 'going'),
  ('71111111-1111-4111-8111-111111111111'::uuid, '+79993333333', 'thinking'),
  ('72222222-2222-4222-8222-222222222222'::uuid, '+79990000000', 'going'),
  ('72222222-2222-4222-8222-222222222222'::uuid, '+79991111111', 'going'),
  ('72222222-2222-4222-8222-222222222222'::uuid, '+79992222222', 'invited'),
  ('73333333-3333-4333-8333-333333333333'::uuid, '+79990000000', 'going'),
  ('73333333-3333-4333-8333-333333333333'::uuid, '+79991111111', 'going'),
  ('73333333-3333-4333-8333-333333333333'::uuid, '+79995555555', 'going')
) rows(plan_id, phone, status)
JOIN users u ON u.phone = rows.phone
ON CONFLICT (plan_id, user_id) DO UPDATE
SET status = EXCLUDED.status;

WITH user_ids AS (
  SELECT
    MAX(id::text) FILTER (WHERE phone = '+79990000000')::uuid AS me,
    MAX(id::text) FILTER (WHERE phone = '+79991111111')::uuid AS u1
  FROM users
)
INSERT INTO plan_proposals (id, plan_id, proposer_id, type, value_text, status)
SELECT rows.*
FROM user_ids
CROSS JOIN LATERAL (VALUES
  ('91111111-1111-4111-8111-111111111111'::uuid, '72222222-2222-4222-8222-222222222222'::uuid, u1, 'place'::proposal_type, 'Иллюзион', 'active'::proposal_status),
  ('92222222-2222-4222-8222-222222222222'::uuid, '72222222-2222-4222-8222-222222222222'::uuid, me, 'place'::proposal_type, 'КиноМакс', 'active'::proposal_status)
) rows(id, plan_id, proposer_id, type, value_text, status)
ON CONFLICT (id) DO UPDATE
SET plan_id = EXCLUDED.plan_id,
    proposer_id = EXCLUDED.proposer_id,
    type = EXCLUDED.type,
    value_text = EXCLUDED.value_text,
    status = EXCLUDED.status;

INSERT INTO votes (proposal_id, voter_id)
SELECT proposal_id, u.id
FROM (VALUES
  ('91111111-1111-4111-8111-111111111111'::uuid, '+79992222222'),
  ('91111111-1111-4111-8111-111111111111'::uuid, '+79990000000')
) rows(proposal_id, phone)
JOIN users u ON u.phone = rows.phone
ON CONFLICT (proposal_id, voter_id) DO NOTHING;

INSERT INTO messages (id, context_type, context_id, sender_id, text, type, reference_id)
SELECT rows.id, 'plan'::message_context, rows.context_id, u.id, rows.text, 'user'::message_type, NULL::uuid
FROM (VALUES
  ('a1111111-1111-4111-8111-111111111111'::uuid, '71111111-1111-4111-8111-111111111111'::uuid, '+79990000000', 'Встречаемся у метро в 19:30'),
  ('a2222222-2222-4222-8222-222222222222'::uuid, '71111111-1111-4111-8111-111111111111'::uuid, '+79992222222', 'Ок, буду!'),
  ('a3333333-3333-4333-8333-333333333333'::uuid, '71111111-1111-4111-8111-111111111111'::uuid, '+79993333333', 'Я наверное опоздаю чуть-чуть')
) rows(id, context_id, phone, text)
JOIN users u ON u.phone = rows.phone
ON CONFLICT (id) DO UPDATE
SET context_type = EXCLUDED.context_type,
    context_id = EXCLUDED.context_id,
    sender_id = EXCLUDED.sender_id,
    text = EXCLUDED.text,
    type = EXCLUDED.type,
    reference_id = EXCLUDED.reference_id;

WITH me AS (SELECT id FROM users WHERE phone = '+79990000000')
INSERT INTO groups (id, creator_id, name)
SELECT rows.*
FROM me
CROSS JOIN LATERAL (VALUES
  ('81111111-1111-4111-8111-111111111111'::uuid, me.id, 'Кино-клуб'),
  ('82222222-2222-4222-8222-222222222222'::uuid, me.id, 'Барная компания')
) rows(id, creator_id, name)
ON CONFLICT (id) DO UPDATE
SET creator_id = EXCLUDED.creator_id,
    name = EXCLUDED.name;

INSERT INTO group_members (group_id, user_id, role)
SELECT group_id, u.id, 'member'::group_role
FROM (VALUES
  ('81111111-1111-4111-8111-111111111111'::uuid, '+79990000000'),
  ('81111111-1111-4111-8111-111111111111'::uuid, '+79991111111'),
  ('81111111-1111-4111-8111-111111111111'::uuid, '+79992222222'),
  ('82222222-2222-4222-8222-222222222222'::uuid, '+79990000000'),
  ('82222222-2222-4222-8222-222222222222'::uuid, '+79992222222'),
  ('82222222-2222-4222-8222-222222222222'::uuid, '+79993333333'),
  ('82222222-2222-4222-8222-222222222222'::uuid, '+79994444444')
) rows(group_id, phone)
JOIN users u ON u.phone = rows.phone
ON CONFLICT (group_id, user_id) DO NOTHING;

INSERT INTO invitations (type, target_id, inviter_id, invitee_id, status)
SELECT 'plan'::invitation_type, '71111111-1111-4111-8111-111111111111'::uuid, inviter.id, invitee.id, 'pending'::invitation_status
FROM users inviter
JOIN users invitee ON invitee.phone = '+79990000000'
WHERE inviter.phone = '+79992222222'
ON CONFLICT (type, target_id, invitee_id) DO UPDATE
SET status = EXCLUDED.status,
    inviter_id = EXCLUDED.inviter_id;

INSERT INTO notifications (id, user_id, type, payload, read)
SELECT rows.id, u.id, rows.type::notification_type, rows.payload::jsonb, false
FROM (VALUES
  ('b1111111-1111-4111-8111-111111111111'::uuid, '+79990000000', 'plan_invite', '{"plan_id":"71111111-1111-4111-8111-111111111111","inviter_name":"Дима"}'),
  ('b2222222-2222-4222-8222-222222222222'::uuid, '+79990000000', 'proposal_created', '{"plan_id":"72222222-2222-4222-8222-222222222222","proposer_name":"Маша"}')
) rows(id, phone, type, payload)
JOIN users u ON u.phone = rows.phone
ON CONFLICT (id) DO UPDATE
SET user_id = EXCLUDED.user_id,
    type = EXCLUDED.type,
    payload = EXCLUDED.payload,
    read = EXCLUDED.read;
