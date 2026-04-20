import type { Event, Venue, User, Group, Plan, PlanParticipant, Message, Notification, Invitation } from '../types';

export const mockUsers: User[] = [
  { id: 'u1', phone: '+79991111111', name: 'Маша', username: 'masha', avatar_url: null, created_at: '2025-01-01' },
  { id: 'u2', phone: '+79992222222', name: 'Дима', username: 'dima', avatar_url: null, created_at: '2025-01-02' },
  { id: 'u3', phone: '+79993333333', name: 'Лена', username: 'lena', avatar_url: null, created_at: '2025-01-03' },
  { id: 'u4', phone: '+79994444444', name: 'Артём', username: 'artem', avatar_url: null, created_at: '2025-01-04' },
  { id: 'u5', phone: '+79995555555', name: 'Катя', username: 'katya', avatar_url: null, created_at: '2025-01-05' },
  { id: 'me', phone: '+79990000000', name: 'Я', username: 'me', avatar_url: null, created_at: '2025-01-01' },
];

export const mockVenues: Venue[] = [
  { id: 'v1', name: 'Музей современного искусства', description: 'Крупнейший музей современного искусства', address: 'ул. Гоголя, 15', lat: 55.7558, lng: 37.6173, cover_image_url: 'https://placehold.co/600x400/6C5CE7/white?text=Museum', created_at: '2025-01-01' },
  { id: 'v2', name: 'Бар «Ночь»', description: 'Коктейль-бар с живой музыкой', address: 'ул. Тверская, 22', lat: 55.765, lng: 37.605, cover_image_url: 'https://placehold.co/600x400/FD79A8/white?text=Bar', created_at: '2025-01-01' },
  { id: 'v3', name: 'Кинотеатр «Иллюзион»', description: 'Артхаус и авторское кино', address: 'Кутузовский пр., 8', lat: 55.74, lng: 37.57, cover_image_url: 'https://placehold.co/600x400/00B894/white?text=Cinema', created_at: '2025-01-01' },
  { id: 'v4', name: 'Стадион «Центральный»', description: 'Футбол и спортивные мероприятия', address: 'Лужники', lat: 55.715, lng: 37.555, cover_image_url: 'https://placehold.co/600x400/74B9FF/white?text=Stadium', created_at: '2025-01-01' },
  { id: 'v5', name: 'Галерея «Новый взгляд»', description: 'Выставки молодых художников', address: 'Патриаршие, 3', lat: 55.76, lng: 37.59, cover_image_url: 'https://placehold.co/600x400/FDCB6E/white?text=Gallery', created_at: '2025-01-01' },
];

export const mockEvents: Event[] = [
  {
    id: 'e1', venue_id: 'v1', title: 'Ретроспектива Кабакова', description: 'Масштабная выставка Ильи Кабакова — более 200 работ из частных коллекций мира.', cover_image_url: 'https://placehold.co/600x400/6C5CE7/white?text=Kabakov', starts_at: '2026-04-25T10:00:00', ends_at: '2026-04-25T20:00:00', category: 'exhibition', tags: ['искусство', 'современное'], price_info: '500 ₽', external_url: null, created_at: '2025-01-01', venue: mockVenues[0], friendsInterested: [mockUsers[0]], friendsPlanCount: 0,
  },
  {
    id: 'e2', venue_id: 'v2', title: 'Джазовый вечер', description: 'Живой джаз от квартета «Синий час» и коктейли от шеф-бармена.', cover_image_url: 'https://placehold.co/600x400/FD79A8/white?text=Jazz', starts_at: '2026-04-22T20:00:00', ends_at: '2026-04-23T02:00:00', category: 'music', tags: ['джаз', 'коктейли'], price_info: 'Вход свободный', external_url: null, created_at: '2025-01-01', venue: mockVenues[1], friendsInterested: [mockUsers[1], mockUsers[2]], friendsPlanCount: 1,
  },
  {
    id: 'e3', venue_id: 'v3', title: 'Фестиваль японского кино', description: 'Три дня лучших фильмов Куросавы, Мидзогути и Одзу.', cover_image_url: 'https://placehold.co/600x400/00B894/white?text=Japan+Cinema', starts_at: '2026-04-26T14:00:00', ends_at: '2026-04-26T22:00:00', category: 'other', tags: ['кино', 'японское'], price_info: '350 ₽', external_url: null, created_at: '2025-01-01', venue: mockVenues[2], friendsInterested: [], friendsPlanCount: 0,
  },
  {
    id: 'e4', venue_id: 'v4', title: 'Дерби: Спартак — Динамо', description: 'Главный матч тура. Сектор для болельщиков гостей.', cover_image_url: 'https://placehold.co/600x400/74B9FF/white?text=Derby', starts_at: '2026-04-27T19:00:00', ends_at: '2026-04-27T21:00:00', category: 'sport', tags: ['футбол', 'дерби'], price_info: 'от 1200 ₽', external_url: null, created_at: '2025-01-01', venue: mockVenues[3], friendsInterested: [mockUsers[3]], friendsPlanCount: 0,
  },
  {
    id: 'e5', venue_id: 'v5', title: 'Открытие сезона: Нео-импрессионизм', description: 'Новая выставка молодых художников в стиле нео-импрессионизма.', cover_image_url: 'https://placehold.co/600x400/FDCB6E/white?text=Neo-Impressionism', starts_at: '2026-04-23T12:00:00', ends_at: '2026-04-23T21:00:00', category: 'exhibition', tags: ['живопись', 'импрессионизм'], price_info: '300 ₽', external_url: null, created_at: '2025-01-01', venue: mockVenues[4], friendsInterested: [mockUsers[0], mockUsers[4]], friendsPlanCount: 2,
  },
  {
    id: 'e6', venue_id: 'v2', title: 'Диджей-сет: Techno Night', description: 'Ночь техно с гостями из Берлина.', cover_image_url: 'https://placehold.co/600x400/A29BFE/white?text=Techno', starts_at: '2026-04-24T23:00:00', ends_at: '2026-04-25T06:00:00', category: 'party', tags: ['техно', 'ночь'], price_info: '800 ₽', external_url: null, created_at: '2025-01-01', venue: mockVenues[1], friendsInterested: [mockUsers[1]], friendsPlanCount: 0,
  },
];

export const mockGroups: Group[] = [
  {
    id: 'g1', creator_id: 'me', name: 'Кино-клуб', avatar_url: null, created_at: '2025-02-01',
    members: [
      { id: 'gm1', group_id: 'g1', user_id: 'me', role: 'member', joined_at: '2025-02-01', user: mockUsers[5] },
      { id: 'gm2', group_id: 'g1', user_id: 'u1', role: 'member', joined_at: '2025-02-01', user: mockUsers[0] },
      { id: 'gm3', group_id: 'g1', user_id: 'u2', role: 'member', joined_at: '2025-02-02', user: mockUsers[1] },
    ],
  },
  {
    id: 'g2', creator_id: 'me', name: 'Барная компания', avatar_url: null, created_at: '2025-03-01',
    members: [
      { id: 'gm4', group_id: 'g2', user_id: 'me', role: 'member', joined_at: '2025-03-01', user: mockUsers[5] },
      { id: 'gm5', group_id: 'g2', user_id: 'u2', role: 'member', joined_at: '2025-03-01', user: mockUsers[1] },
      { id: 'gm6', group_id: 'g2', user_id: 'u3', role: 'member', joined_at: '2025-03-01', user: mockUsers[2] },
      { id: 'gm7', group_id: 'g2', user_id: 'u4', role: 'member', joined_at: '2025-03-02', user: mockUsers[3] },
    ],
  },
];

export const mockPlans: Plan[] = [
  {
    id: 'p1', creator_id: 'me', title: 'Джазовый вечер', activity_type: 'bar', linked_event_id: 'e2',
    place_status: 'confirmed', time_status: 'confirmed',
    confirmed_place_text: 'Бар «Ночь»', confirmed_place_lat: 55.765, confirmed_place_lng: 37.605,
    confirmed_time: '2026-04-22T20:00:00',
    lifecycle_state: 'active', pre_meet_enabled: true, pre_meet_place_text: 'Метро Тверская', pre_meet_time: '2026-04-22T19:30:00',
    created_at: '2026-04-19T15:00:00', updated_at: '2026-04-19T15:30:00',
    linked_event: mockEvents[1],
    participants: [
      { id: 'pp1', plan_id: 'p1', user_id: 'me', status: 'going', joined_at: '2026-04-19T15:00:00', user: mockUsers[5] },
      { id: 'pp2', plan_id: 'p1', user_id: 'u2', status: 'going', joined_at: '2026-04-19T15:05:00', user: mockUsers[1] },
      { id: 'pp3', plan_id: 'p1', user_id: 'u3', status: 'thinking', joined_at: '2026-04-19T15:05:00', user: mockUsers[2] },
    ],
    proposals: [],
  },
  {
    id: 'p2', creator_id: 'me', title: 'Кино в субботу', activity_type: 'cinema', linked_event_id: null,
    place_status: 'undecided', time_status: 'confirmed',
    confirmed_place_text: null, confirmed_place_lat: null, confirmed_place_lng: null,
    confirmed_time: '2026-04-26T18:00:00',
    lifecycle_state: 'active', pre_meet_enabled: false, pre_meet_place_text: null, pre_meet_time: null,
    created_at: '2026-04-18T10:00:00', updated_at: '2026-04-18T10:00:00',
    linked_event: undefined,
    participants: [
      { id: 'pp4', plan_id: 'p2', user_id: 'me', status: 'going', joined_at: '2026-04-18T10:00:00', user: mockUsers[5] },
      { id: 'pp5', plan_id: 'p2', user_id: 'u1', status: 'going', joined_at: '2026-04-18T10:10:00', user: mockUsers[0] },
      { id: 'pp6', plan_id: 'p2', user_id: 'u2', status: 'invited', joined_at: '2026-04-18T10:10:00', user: mockUsers[1] },
    ],
    proposals: [
      { id: 'pr1', plan_id: 'p2', proposer_id: 'u1', type: 'place', value_text: 'Иллюзион', value_lat: 55.74, value_lng: 37.57, value_datetime: null, status: 'active', created_at: '2026-04-19T08:00:00', votes: [{ id: 'v1', proposal_id: 'pr1', voter_id: 'me', created_at: '2026-04-19T09:00:00' }] },
      { id: 'pr2', plan_id: 'p2', proposer_id: 'u2', type: 'place', value_text: 'Формула кино', value_lat: 55.73, value_lng: 37.58, value_datetime: null, status: 'active', created_at: '2026-04-19T09:00:00', votes: [] },
    ],
  },
  {
    id: 'p3', creator_id: 'me', title: 'Выставка Кабакова', activity_type: 'exhibition', linked_event_id: 'e1',
    place_status: 'confirmed', time_status: 'confirmed',
    confirmed_place_text: 'Музей современного искусства', confirmed_place_lat: 55.7558, confirmed_place_lng: 37.6173,
    confirmed_time: '2026-04-12T10:00:00',
    lifecycle_state: 'completed', pre_meet_enabled: false, pre_meet_place_text: null, pre_meet_time: null,
    created_at: '2026-04-10T09:00:00', updated_at: '2026-04-12T14:00:00',
    linked_event: mockEvents[0],
    participants: [
      { id: 'pp7', plan_id: 'p3', user_id: 'me', status: 'going', joined_at: '2026-04-10T09:00:00', user: mockUsers[5] },
      { id: 'pp8', plan_id: 'p3', user_id: 'u1', status: 'going', joined_at: '2026-04-10T09:05:00', user: mockUsers[0] },
      { id: 'pp9', plan_id: 'p3', user_id: 'u5', status: 'going', joined_at: '2026-04-10T09:10:00', user: mockUsers[4] },
    ],
    proposals: [],
  },
];

export const mockMessages: Record<string, Message[]> = {
  p1: [
    { id: 'm1', context_type: 'plan', context_id: 'p1', sender_id: 'me', text: 'Ребята, идём в 20:00?', type: 'user', reference_id: null, client_message_id: null, created_at: '2026-04-19T15:10:00', sender: mockUsers[5] },
    { id: 'm2', context_type: 'plan', context_id: 'p1', sender_id: 'u2', text: 'Да, отлично! Встретимся у метро?', type: 'user', reference_id: null, client_message_id: null, created_at: '2026-04-19T15:12:00', sender: mockUsers[1] },
    { id: 'm3', context_type: 'plan', context_id: 'p1', sender_id: 'me', text: 'Добавил встречу до: Метро Тверская в 19:30', type: 'user', reference_id: null, client_message_id: null, created_at: '2026-04-19T15:30:00', sender: mockUsers[5] },
  ],
  p2: [
    { id: 'm4', context_type: 'plan', context_id: 'p2', sender_id: 'me', text: 'Кино в субботу вечером, место решим!', type: 'user', reference_id: null, client_message_id: null, created_at: '2026-04-18T10:00:00', sender: mockUsers[5] },
    { id: 'm5', context_type: 'plan', context_id: 'p2', sender_id: 'u1', text: 'Давайте в Иллюзион?', type: 'user', reference_id: null, client_message_id: null, created_at: '2026-04-19T08:00:00', sender: mockUsers[0] },
    { id: 'm6', context_type: 'plan', context_id: 'p2', sender_id: 'u1', text: '', type: 'proposal_card', reference_id: 'pr1', client_message_id: null, created_at: '2026-04-19T08:00:00', sender: mockUsers[0] },
    { id: 'm7', context_type: 'plan', context_id: 'p2', sender_id: 'u2', text: 'Или Формулу кино, там удобнее', type: 'user', reference_id: null, client_message_id: null, created_at: '2026-04-19T09:00:00', sender: mockUsers[1] },
    { id: 'm8', context_type: 'plan', context_id: 'p2', sender_id: 'u2', text: '', type: 'proposal_card', reference_id: 'pr2', client_message_id: null, created_at: '2026-04-19T09:00:00', sender: mockUsers[1] },
  ],
  p3: [
    { id: 'm9', context_type: 'plan', context_id: 'p3', sender_id: 'me', text: 'Идём на Кабакова в субботу?', type: 'user', reference_id: null, client_message_id: null, created_at: '2026-04-10T09:00:00', sender: mockUsers[5] },
    { id: 'm10', context_type: 'plan', context_id: 'p3', sender_id: 'u1', text: 'Да, давно хотела!', type: 'user', reference_id: null, client_message_id: null, created_at: '2026-04-10T09:05:00', sender: mockUsers[0] },
  ],
};

export const mockNotifications: Notification[] = [
  { id: 'n1', user_id: 'me', type: 'plan_invite', payload: { plan_id: 'p1', inviter_name: 'Дима' }, read: false, created_at: '2026-04-19T15:05:00' },
  { id: 'n2', user_id: 'me', type: 'proposal_created', payload: { plan_id: 'p2', proposer_name: 'Маша' }, read: false, created_at: '2026-04-19T08:00:00' },
  { id: 'n3', user_id: 'me', type: 'proposal_created', payload: { plan_id: 'p2', proposer_name: 'Дима' }, read: true, created_at: '2026-04-19T09:00:00' },
];

export const mockInvitations: Invitation[] = [
  { id: 'i1', type: 'plan', target_id: 'p1', inviter_id: 'u2', invitee_id: 'me', status: 'pending', created_at: '2026-04-19T15:05:00', plan: mockPlans[0] },
];
