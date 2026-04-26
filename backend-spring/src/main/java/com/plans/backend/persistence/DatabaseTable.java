package com.plans.backend.persistence;

public enum DatabaseTable {
    USERS("users"),
    FRIENDSHIPS("friendships"),
    VENUES("venues"),
    EVENTS("events"),
    EVENT_INTERESTS("event_interests"),
    PLANS("plans"),
    PLAN_PARTICIPANTS("plan_participants"),
    PLAN_PROPOSALS("plan_proposals"),
    VOTES("votes"),
    MESSAGES("messages"),
    GROUPS("groups"),
    GROUP_MEMBERS("group_members"),
    INVITATIONS("invitations"),
    NOTIFICATIONS("notifications");

    private final String tableName;

    DatabaseTable(String tableName) {
        this.tableName = tableName;
    }

    String tableName() {
        return tableName;
    }
}
