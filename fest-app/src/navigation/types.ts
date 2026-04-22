export type HomeStackParamList = {
  HomeFeed: undefined;
  EventDetails: { eventId: string };
  CreatePlanFromEvent: { eventId: string };
  VenueDetails: { venueId: string };
};

export type PlansStackParamList = {
  PlansList: undefined;
  PlanDetails: { planId: string };
  GroupDetails: { groupId: string };
  CreatePlan: { preselectedGroupIds?: string[]; preselectedFriendIds?: string[]; activityType?: string; title?: string };
};

export type RootStackParamList = {
  MainTabs: undefined;
  Notifications: undefined;
  PublicProfile: { userId: string };
};
