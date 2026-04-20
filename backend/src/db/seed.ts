import { randomUUID } from 'crypto';
import { query } from './pool.js';

const U: Record<string, string> = {};
function u(key: string): string { if (!U[key]) U[key] = randomUUID(); return U[key]; }

async function seed() {
  console.log('Seeding dev data...');

  // First, try to fetch existing users by their phone numbers
  const phones = ['+79990000000', '+79991111111', '+79992222222', '+79993333333', '+79994444444', '+79995555555'];
  const existingUsers = await query(
    `SELECT id, phone FROM users WHERE phone = ANY($1::text[])`,
    [phones]
  );

  // Map existing users by phone
  const phoneToId: Record<string, string> = {};
  for (const row of existingUsers.rows) {
    phoneToId[row.phone] = row.id;
  }

  // Generate UUIDs for users not yet in DB
  const me = phoneToId['+79990000000'] || u('me');
  const u1 = phoneToId['+79991111111'] || u('u1');
  const u2 = phoneToId['+79992222222'] || u('u2');
  const u3 = phoneToId['+79993333333'] || u('u3');
  const u4 = phoneToId['+79994444444'] || u('u4');
  const u5 = phoneToId['+79995555555'] || u('u5');

  // Store in U map for consistency
  U['me'] = me; U['u1'] = u1; U['u2'] = u2; U['u3'] = u3; U['u4'] = u4; U['u5'] = u5;

  const v1=u('v1'),v2=u('v2'),v3=u('v3'),v4=u('v4'),v5=u('v5');
  const e1=u('e1'),e2=u('e2'),e3=u('e3'),e4=u('e4'),e5=u('e5'),e6=u('e6');
  const p1=u('p1'),p2=u('p2'),p3=u('p3');
  const g1=u('g1'),g2=u('g2');

  await query(`INSERT INTO users (id, phone, name, username) VALUES
    ('${u1}','+79991111111','Маша','masha'),
    ('${u2}','+79992222222','Дима','dima'),
    ('${u3}','+79993333333','Лена','lena'),
    ('${u4}','+79994444444','Артём','artem'),
    ('${u5}','+79995555555','Катя','katya'),
    ('${me}','+79990000000','Я','me')
    ON CONFLICT (phone) DO NOTHING`);

  const f = (a:string,b:string) => a<b ? `('${a}','${b}','accepted')` : `('${b}','${a}','accepted')`;
  await query(`INSERT INTO friendships (requester_id, addressee_id, status) VALUES
    ${f(me,u1)}, ${f(me,u2)}, ${f(me,u3)}, ${f(me,u4)}, ${f(me,u5)},
    ${f(u1,u2)}, ${f(u2,u3)}
    ON CONFLICT (requester_id, addressee_id) DO NOTHING`);

  await query(`INSERT INTO venues (id, name, description, address, lat, lng, cover_image_url) VALUES
    ('${v1}','Музей современного искусства','Крупнейший музей','ул. Гоголя, 15',55.7558,37.6173,'https://placehold.co/600x400/6C5CE7/white?text=Museum'),
    ('${v2}','Бар «Ночь»','Коктейль-бар','ул. Тверская, 22',55.765,37.605,'https://placehold.co/600x400/FD79A8/white?text=Bar'),
    ('${v3}','Кинотеатр «Иллюзион»','Артхаус','Кутузовский пр., 8',55.74,37.57,'https://placehold.co/600x400/00B894/white?text=Cinema'),
    ('${v4}','Стадион «Центральный»','Спорт','Лужники',55.715,37.555,'https://placehold.co/600x400/74B9FF/white?text=Stadium'),
    ('${v5}','Галерея «Новый взгляд»','Молодые художники','Патриаршие, 3',55.76,37.59,'https://placehold.co/600x400/FDCB6E/white?text=Gallery')
    ON CONFLICT (id) DO NOTHING`);

  await query(`INSERT INTO events (id, venue_id, title, description, cover_image_url, starts_at, ends_at, category, tags, price_info) VALUES
    ('${e1}','${v1}','Ретроспектива Кабакова','Масштабная выставка','https://placehold.co/600x400/6C5CE7/white?text=Kabakov','2026-04-25T10:00:00+03:00','2026-04-25T20:00:00+03:00','exhibition',ARRAY['искусство'],'500 ₽'),
    ('${e2}','${v2}','Джазовый вечер','Живой джаз','https://placehold.co/600x400/FD79A8/white?text=Jazz','2026-04-22T20:00:00+03:00','2026-04-23T02:00:00+03:00','music',ARRAY['джаз'],'Вход свободный'),
    ('${e3}','${v3}','Фестиваль японского кино','Куросава, Мидзогути, Одзу','https://placehold.co/600x400/00B894/white?text=Japan+Cinema','2026-04-26T14:00:00+03:00','2026-04-26T22:00:00+03:00','other',ARRAY['кино'],'350 ₽'),
    ('${e4}','${v4}','Дерби: Спартак — Динамо','Главный матч тура','https://placehold.co/600x400/74B9FF/white?text=Derby','2026-04-27T19:00:00+03:00','2026-04-27T21:00:00+03:00','sport',ARRAY['футбол'],'от 1200 ₽'),
    ('${e5}','${v5}','Нео-импрессионизм','Новая выставка','https://placehold.co/600x400/FDCB6E/white?text=Neo-Impressionism','2026-04-23T12:00:00+03:00','2026-04-23T21:00:00+03:00','exhibition',ARRAY['живопись'],'300 ₽'),
    ('${e6}','${v2}','Techno Night','Ночь техно из Берлина','https://placehold.co/600x400/A29BFE/white?text=Techno','2026-04-24T23:00:00+03:00','2026-04-25T06:00:00+03:00','party',ARRAY['техно'],'800 ₽')
    ON CONFLICT (id) DO NOTHING`);

  await query(`INSERT INTO event_interests (user_id, event_id) VALUES
    ('${u1}','${e1}'),('${u2}','${e2}'),('${u3}','${e2}'),('${u4}','${e4}'),('${u1}','${e5}'),('${u5}','${e5}'),('${u2}','${e6}')
    ON CONFLICT (user_id, event_id) DO NOTHING`);

  await query(`INSERT INTO plans (id, creator_id, title, activity_type, linked_event_id, place_status, time_status, confirmed_place_text, confirmed_place_lat, confirmed_place_lng, confirmed_time, lifecycle_state, pre_meet_enabled, pre_meet_place_text, pre_meet_time) VALUES
    ('${p1}','${me}','Джазовый вечер','bar','${e2}','confirmed','confirmed','Бар «Ночь»',55.765,37.605,'2026-04-22T20:00:00+03:00','active',true,'Метро Тверская','2026-04-22T19:30:00+03:00'),
    ('${p2}','${me}','Кино в субботу','cinema',NULL,'proposed','confirmed',NULL,NULL,NULL,'2026-04-26T18:00:00+03:00','active',false,NULL,NULL),
    ('${p3}','${me}','Выставка Кабакова','exhibition','${e1}','confirmed','confirmed','Музей современного искусства',55.7558,37.6173,'2026-04-12T10:00:00+03:00','completed',false,NULL,NULL)
    ON CONFLICT (id) DO NOTHING`);

  await query(`INSERT INTO plan_participants (plan_id, user_id, status) VALUES
    ('${p1}','${me}','going'),('${p1}','${u2}','going'),('${p1}','${u3}','thinking'),
    ('${p2}','${me}','going'),('${p2}','${u1}','going'),('${p2}','${u2}','invited'),
    ('${p3}','${me}','going'),('${p3}','${u1}','going'),('${p3}','${u5}','going')
    ON CONFLICT (plan_id, user_id) DO NOTHING`);

  // Proposals for p2 (undecided place, confirmed time from creation)
  const prop1 = u('prop1'), prop2 = u('prop2');
  await query(`INSERT INTO plan_proposals (id, plan_id, proposer_id, type, value_text, status) VALUES
    ('${prop1}','${p2}','${u1}','place','Иллюзион','active'),
    ('${prop2}','${p2}','${me}','place','КиноМакс','active')
    ON CONFLICT (id) DO NOTHING`);

  await query(`INSERT INTO votes (proposal_id, voter_id) VALUES ('${prop1}','${u2}'), ('${prop1}','${me}') ON CONFLICT (proposal_id, voter_id) DO NOTHING`);

  // Messages for p1
  const msg1 = u('msg1'), msg2 = u('msg2'), msg3 = u('msg3');
  await query(`INSERT INTO messages (id, context_type, context_id, sender_id, text, type, reference_id) VALUES
    ('${msg1}','plan','${p1}','${me}','Встречаемся у метро в 19:30','user',NULL),
    ('${msg2}','plan','${p1}','${u2}','Ок, буду!','user',NULL),
    ('${msg3}','plan','${p1}','${u3}','Я наверное опоздаю чуть-чуть','user',NULL)
    ON CONFLICT (id) DO NOTHING`);

  await query(`INSERT INTO groups (id, creator_id, name) VALUES ('${g1}','${me}','Кино-клуб'),('${g2}','${me}','Барная компания') ON CONFLICT (id) DO NOTHING`);

  await query(`INSERT INTO group_members (group_id, user_id, role) VALUES
    ('${g1}','${me}','member'),('${g1}','${u1}','member'),('${g1}','${u2}','member'),
    ('${g2}','${me}','member'),('${g2}','${u2}','member'),('${g2}','${u3}','member'),('${g2}','${u4}','member')
    ON CONFLICT (group_id, user_id) DO NOTHING`);

  await query(`INSERT INTO invitations (type, target_id, inviter_id, invitee_id, status) VALUES ('plan','${p1}','${u2}','${me}','pending') ON CONFLICT DO NOTHING`);

  await query(`INSERT INTO notifications (user_id, type, payload) VALUES
    ('${me}','plan_invite','${JSON.stringify({plan_id:p1,inviter_name:'Дима'})}'::jsonb),
    ('${me}','proposal_created','${JSON.stringify({plan_id:p2,proposer_name:'Маша'})}'::jsonb)
    ON CONFLICT DO NOTHING`);

  console.log('Seed complete. UUID map:');
  console.log(JSON.stringify(U, null, 2));
  process.exit(0);
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
