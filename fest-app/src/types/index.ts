export interface User {
  id: string;
  phone: string;
  name: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

export interface Venue {
  id: string;
  name: string;
  description: string;
  address: string;
  lat: number;
  lng: number;
  cover_image_url: string;
  created_at: string;
}

export interface Event {
  id: string;
  venue_id: string;
  title: string;
  description: string;
  cover_image_url: string;
  starts_at: string;
  ends_at: string;
  category: EventCategory;
  tags: string[];
  price_info: string | null;
  external_url: string | null;
  created_at: string;
  venue?: Venue;
  friendsInterested?: User[];
  friendsPlanCount?: number;
}

export type EventCategory =
  | 'music'
  | 'theatre'
  | 'exhibition'
  | 'sport'
  | 'food'
  | 'party'
  | 'workshop'
  | 'other';

export interface EventInterest {
  id: string;
  user_id: string;
  event_id: string;
  created_at: string;
}

export interface SavedEvent {
  id: string;
  user_id: string;
  event_id: string;
  created_at: string;
}

export type PlanLifecycle = 'active' | 'finalized' | 'completed' | 'cancelled';
export type PlaceStatus = 'confirmed' | 'proposed' | 'undecided';
export type TimeStatus = 'confirmed' | 'proposed' | 'undecided';
export type ActivityType =
  | 'cinema'
  | 'coffee'
  | 'bar'
  | 'walk'
  | 'dinner'
  | 'sport'
  | 'exhibition'
  | 'other';

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  cinema: 'Кино',
  coffee: 'Кофе',
  bar: 'Бар',
  walk: 'Прогулка',
  dinner: 'Ужин',
  sport: 'Спорт',
  exhibition: 'Выставка',
  other: 'Другое',
};

export interface Plan {
  id: string;
  creator_id: string;
  title: string;
  activity_type: ActivityType;
  linked_event_id: string | null;
  place_status: PlaceStatus;
  time_status: TimeStatus;
  confirmed_place_text: string | null;
  confirmed_place_lat: number | null;
  confirmed_place_lng: number | null;
  confirmed_time: string | null;
  lifecycle_state: PlanLifecycle;
  pre_meet_enabled: boolean;
  pre_meet_place_text: string | null;
  pre_meet_time: string | null;
  created_at: string;
  updated_at: string;
  linked_event?: Event;
  participants?: PlanParticipant[];
  proposals?: PlanProposal[];
}

export type ParticipantStatus = 'invited' | 'going' | 'thinking' | 'cant';

export interface PlanParticipant {
  id: string;
  plan_id: string;
  user_id: string;
  status: ParticipantStatus;
  joined_at: string;
  user?: User;
}

export type ProposalType = 'place' | 'time';
export type ProposalStatus = 'active' | 'finalized' | 'superseded';

export interface PlanProposal {
  id: string;
  plan_id: string;
  proposer_id: string;
  type: ProposalType;
  value_text: string;
  value_lat: number | null;
  value_lng: number | null;
  value_datetime: string | null;
  status: ProposalStatus;
  created_at: string;
  votes?: Vote[];
}

export interface Vote {
  id: string;
  proposal_id: string;
  voter_id: string;
  created_at: string;
}

export interface Group {
  id: string;
  creator_id: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
  members?: GroupMember[];
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'member';
  joined_at: string;
  user?: User;
}

export type InvitationType = 'plan' | 'group';
export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface Invitation {
  id: string;
  type: InvitationType;
  target_id: string;
  inviter_id: string;
  invitee_id: string;
  status: InvitationStatus;
  created_at: string;
  plan?: Plan;
  group?: Group;
}

export type NotificationType =
  | 'plan_invite'
  | 'group_invite'
  | 'proposal_created'
  | 'plan_finalized'
  | 'plan_unfinalized'
  | 'event_time_changed'
  | 'event_cancelled'
  | 'plan_reminder'
  | 'plan_completed';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export type MessageType = 'user' | 'system' | 'proposal_card';

export interface Message {
  id: string;
  context_type: 'plan';
  context_id: string;
  sender_id: string;
  text: string;
  type: MessageType;
  reference_id: string | null;
  client_message_id: string | null;
  created_at: string;
  sender?: User;
}
