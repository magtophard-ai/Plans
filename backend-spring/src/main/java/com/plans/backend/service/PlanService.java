package com.plans.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plans.backend.api.error.ApiException;
import com.plans.backend.persistence.SqlRows;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlanService {
    private static final Set<String> ACTIVITY_TYPES = Set.of(
        "cinema", "coffee", "bar", "walk", "dinner", "sport", "exhibition", "other"
    );
    private static final Set<String> PARTICIPANT_STATUSES = Set.of("going", "thinking", "cant");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcClient jdbc;
    private final ObjectMapper objectMapper;

    public PlanService(JdbcClient jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> listPlans(UUID userId, String lifecycle, String participant, String page, String limit) {
        StringBuilder where = new StringBuilder("1=1");
        if (lifecycle != null) {
            where.append(" AND p.lifecycle_state = ANY(string_to_array(:lifecycle, '|')::plan_lifecycle[])");
        }
        if ("me".equals(participant)) {
            where.append(
                " AND EXISTS (SELECT 1 FROM plan_participants pp WHERE pp.plan_id = p.id AND pp.user_id = :userId)"
            );
        }

        var countStatement = jdbc.sql("SELECT COUNT(*) AS c FROM plans p WHERE " + where);
        if (lifecycle != null) {
            countStatement = countStatement.param("lifecycle", lifecycle);
        }
        if ("me".equals(participant)) {
            countStatement = countStatement.param("userId", userId);
        }
        Number total = countStatement.query(Number.class).single();

        int offset = (parseInt(page, 1) - 1) * parseInt(limit, 20);
        int lmt = Math.min(parseInt(limit, 20), 100);
        var plansStatement = jdbc.sql(
                "SELECT p.* FROM plans p WHERE " + where + " ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset"
            )
            .param("limit", lmt)
            .param("offset", offset);
        if (lifecycle != null) {
            plansStatement = plansStatement.param("lifecycle", lifecycle);
        }
        if ("me".equals(participant)) {
            plansStatement = plansStatement.param("userId", userId);
        }

        List<Map<String, Object>> plans = plansStatement.query()
            .listOfRows()
            .stream()
            .map(row -> getPlanFull(UUID.fromString(row.get("id").toString())))
            .toList();
        return Map.of("plans", plans, "total", total.intValue());
    }

    @Transactional
    public Map<String, Object> createPlan(UUID userId, Map<String, Object> values) {
        String title = requiredString(values.get("title"), "title required").trim();
        String activityType = optionalString(values.get("activity_type"));
        if (activityType == null) {
            activityType = "other";
        }
        if (!ACTIVITY_TYPES.contains(activityType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "Invalid activity_type");
        }
        List<UUID> participantIds = participantIds(values.get("participant_ids"), userId);
        if (1 + participantIds.size() > 15) {
            throw new ApiException(HttpStatus.CONFLICT, "PLAN_FULL", "Max 15 participants including creator");
        }

        Object confirmedPlaceLat = values.get("confirmed_place_lat");
        if (confirmedPlaceLat != null && !(confirmedPlaceLat instanceof Number)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "confirmed_place_lat must be a number");
        }
        Object confirmedPlaceLng = values.get("confirmed_place_lng");
        if (confirmedPlaceLng != null && !(confirmedPlaceLng instanceof Number)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "confirmed_place_lng must be a number");
        }
        String confirmedTime = validatedDate(values.get("confirmed_time"), "confirmed_time must be a valid date");
        String confirmedPlaceText = optionalString(values.get("confirmed_place_text"));
        String preMeetPlaceText = optionalString(values.get("pre_meet_place_text"));
        String preMeetTime = validatedDate(values.get("pre_meet_time"), "pre_meet_time must be a valid date");
        UUID linkedEventId = optionalUuid(values.get("linked_event_id"));
        boolean preMeetEnabled = Boolean.TRUE.equals(values.get("pre_meet_enabled"));
        String placeStatus = confirmedPlaceText != null ? "confirmed" : "undecided";
        String timeStatus = confirmedTime != null ? "confirmed" : "undecided";

        Map<String, Object> plan = jdbc.sql(
                """
                INSERT INTO plans (
                  creator_id, title, activity_type, linked_event_id, place_status, time_status,
                  confirmed_place_text, confirmed_place_lat, confirmed_place_lng, confirmed_time,
                  pre_meet_enabled, pre_meet_place_text, pre_meet_time, share_token
                )
                VALUES (
                  :creatorId, :title, CAST(:activityType AS activity_type), :linkedEventId,
                  CAST(:placeStatus AS place_status), CAST(:timeStatus AS time_status),
                  :confirmedPlaceText, :confirmedPlaceLat, :confirmedPlaceLng,
                  CAST(:confirmedTime AS timestamptz), :preMeetEnabled, :preMeetPlaceText,
                  CAST(:preMeetTime AS timestamptz), :shareToken
                )
                RETURNING *
                """
            )
            .param("creatorId", userId)
            .param("title", title)
            .param("activityType", activityType)
            .param("linkedEventId", linkedEventId)
            .param("placeStatus", placeStatus)
            .param("timeStatus", timeStatus)
            .param("confirmedPlaceText", confirmedPlaceText)
            .param("confirmedPlaceLat", confirmedPlaceLat)
            .param("confirmedPlaceLng", confirmedPlaceLng)
            .param("confirmedTime", confirmedTime)
            .param("preMeetEnabled", preMeetEnabled)
            .param("preMeetPlaceText", preMeetPlaceText)
            .param("preMeetTime", preMeetTime)
            .param("shareToken", newShareToken())
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElseThrow();

        UUID planId = UUID.fromString(plan.get("id").toString());
        jdbc.sql(
                "INSERT INTO plan_participants (plan_id, user_id, status) VALUES (:planId, :userId, 'going')"
            )
            .param("planId", planId)
            .param("userId", userId)
            .update();

        String inviterName = jdbc.sql("SELECT name FROM users WHERE id = :userId")
            .param("userId", userId)
            .query(String.class)
            .optional()
            .orElse(null);
        for (UUID participantId : participantIds) {
            jdbc.sql(
                    """
                    INSERT INTO plan_participants (plan_id, user_id, status)
                    VALUES (:planId, :userId, 'invited')
                    """
                )
                .param("planId", planId)
                .param("userId", participantId)
                .update();
            jdbc.sql(
                    """
                    INSERT INTO invitations (type, target_id, inviter_id, invitee_id, status)
                    VALUES ('plan', :planId, :inviterId, :inviteeId, 'pending')
                    """
                )
                .param("planId", planId)
                .param("inviterId", userId)
                .param("inviteeId", participantId)
                .update();
            insertNotification(participantId, "plan_invite", planInvitePayload(planId, inviterName));
        }
        return Map.of("plan", getPlanFull(planId));
    }

    public Map<String, Object> getPlan(UUID planId) {
        return Map.of("plan", getPlanFullRequired(planId));
    }

    public Map<String, Object> getPlanByToken(String token) {
        Map<String, Object> plan = jdbc.sql(
                """
                SELECT p.*,
                       u.id AS u_id, u.name AS u_name, u.username AS u_username, u.avatar_url AS u_avatar,
                       (SELECT COUNT(*)::int FROM plan_participants pp WHERE pp.plan_id = p.id) AS participant_count
                FROM plans p
                LEFT JOIN users u ON u.id = p.creator_id
                WHERE p.share_token = :token
                """
            )
            .param("token", token)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(this::planPreviewRow)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Plan not found"));
        return Map.of("plan", plan);
    }

    @Transactional
    public Map<String, Object> joinPlanByToken(UUID userId, String token) {
        Map<String, Object> plan = jdbc.sql("SELECT * FROM plans WHERE share_token = :token FOR UPDATE")
            .param("token", token)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Plan not found"));
        UUID planId = UUID.fromString(plan.get("id").toString());
        String state = plan.get("lifecycle_state").toString();
        if (!"active".equals(state) && !"finalized".equals(state)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATE", "Plan is not joinable");
        }

        boolean existing = jdbc.sql(
                "SELECT 1 FROM plan_participants WHERE plan_id = :planId AND user_id = :userId"
            )
            .param("planId", planId)
            .param("userId", userId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .isPresent();
        if (existing) {
            return Map.of("already_joined", true, "plan", getPlanFull(planId));
        }

        Number count = jdbc.sql("SELECT COUNT(*) FROM plan_participants WHERE plan_id = :planId")
            .param("planId", planId)
            .query(Number.class)
            .single();
        if (count.intValue() >= 15) {
            throw new ApiException(HttpStatus.CONFLICT, "PLAN_FULL", "Plan has max 15 participants");
        }

        jdbc.sql("INSERT INTO plan_participants (plan_id, user_id, status) VALUES (:planId, :userId, 'going')")
            .param("planId", planId)
            .param("userId", userId)
            .update();
        String joinerName = jdbc.sql("SELECT name FROM users WHERE id = :userId")
            .param("userId", userId)
            .query(String.class)
            .optional()
            .orElse(null);
        insertNotification(
            UUID.fromString(plan.get("creator_id").toString()),
            "plan_join_via_link",
            planJoinViaLinkPayload(planId, userId, joinerName)
        );
        return Map.of("already_joined", false, "plan", getPlanFull(planId));
    }


    public Map<String, Object> listProposals(UUID userId, UUID planId, String type, String status) {
        basePlanRequired(planId);
        requireParticipant(userId, planId, "Only participants can view proposals");
        validateProposalType(type);
        validateProposalStatus(status);
        return Map.of("proposals", proposals(planId, type, status));
    }

    @Transactional
    public Map<String, Object> createProposal(UUID userId, UUID planId, Map<String, Object> body) {
        String type = requiredString(body.get("type"), "type and value_text required").trim();
        String valueText = requiredString(body.get("value_text"), "type and value_text required").trim();
        if (!Set.of("place", "time").contains(type)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "type must be place or time");
        }
        Object valueLat = body.get("value_lat");
        if (valueLat != null && !(valueLat instanceof Number)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "value_lat must be a number");
        }
        Object valueLng = body.get("value_lng");
        if (valueLng != null && !(valueLng instanceof Number)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "value_lng must be a number");
        }
        String valueDatetime = validatedDate(body.get("value_datetime"), "value_datetime must be a valid date");

        Map<String, Object> plan = basePlanRequired(planId);
        if (!"active".equals(plan.get("lifecycle_state").toString())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATE", "Cannot propose in non-active plan");
        }
        requireParticipant(userId, planId, "Only participants can propose");

        Map<String, Object> proposal = jdbc.sql(
                """
                INSERT INTO plan_proposals (plan_id, proposer_id, type, value_text, value_lat, value_lng, value_datetime)
                VALUES (:planId, :proposerId, CAST(:type AS proposal_type), :valueText, :valueLat, :valueLng,
                        CAST(:valueDatetime AS timestamptz))
                RETURNING *
                """
            )
            .param("planId", planId)
            .param("proposerId", userId)
            .param("type", type)
            .param("valueText", valueText)
            .param("valueLat", valueLat)
            .param("valueLng", valueLng)
            .param("valueDatetime", valueDatetime)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(row -> (Map<String, Object>) new LinkedHashMap<String, Object>(SqlRows.normalize(row)))
            .orElseThrow();

        if ("place".equals(type) && "undecided".equals(plan.get("place_status").toString())) {
            jdbc.sql("UPDATE plans SET place_status = 'proposed', updated_at = now() WHERE id = :planId")
                .param("planId", planId)
                .update();
        }
        if ("time".equals(type) && "undecided".equals(plan.get("time_status").toString())) {
            jdbc.sql("UPDATE plans SET time_status = 'proposed', updated_at = now() WHERE id = :planId")
                .param("planId", planId)
                .update();
        }

        jdbc.sql(
                """
                INSERT INTO messages (context_type, context_id, sender_id, text, type, reference_id)
                VALUES ('plan', :planId, :senderId, '', 'proposal_card', :proposalId)
                """
            )
            .param("planId", planId)
            .param("senderId", userId)
            .param("proposalId", UUID.fromString(proposal.get("id").toString()))
            .update();

        String proposerName = jdbc.sql("SELECT name FROM users WHERE id = :userId")
            .param("userId", userId)
            .query(String.class)
            .optional()
            .orElse(null);
        List<UUID> participantIds = jdbc.sql(
                "SELECT user_id FROM plan_participants WHERE plan_id = :planId AND user_id != :userId"
            )
            .param("planId", planId)
            .param("userId", userId)
            .query(UUID.class)
            .list();
        for (UUID participantId : participantIds) {
            insertNotification(participantId, "proposal_created", proposalCreatedPayload(planId, proposerName, type));
        }

        proposal.put("votes", List.of());
        return Map.of("proposal", proposal);
    }

    @Transactional
    public Map<String, Object> vote(UUID userId, UUID planId, UUID proposalId) {
        Map<String, Object> plan = basePlanRequired(planId);
        if (!"active".equals(plan.get("lifecycle_state").toString())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATE", "Cannot vote in non-active plan");
        }
        Map<String, Object> proposal = proposalRequired(planId, proposalId);
        if (!"active".equals(proposal.get("status").toString())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATE", "Cannot vote on non-active proposal");
        }
        requireParticipant(userId, planId, "Only participants can vote");

        Map<String, Object> existing = findVote(proposalId, userId);
        if (existing != null) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_VOTED", "Already voted on this proposal");
        }

        Number votesForType = jdbc.sql(
                """
                SELECT COUNT(*)
                FROM votes v
                JOIN plan_proposals pp ON v.proposal_id = pp.id
                WHERE pp.plan_id = :planId
                  AND pp.type = CAST(:type AS proposal_type)
                  AND v.voter_id = :userId
                  AND pp.status = 'active'
                """
            )
            .param("planId", planId)
            .param("type", proposal.get("type").toString())
            .param("userId", userId)
            .query(Number.class)
            .single();
        if (votesForType.intValue() >= 2) {
            throw new ApiException(HttpStatus.CONFLICT, "MAX_VOTES_EXCEEDED", "Max 2 votes per proposal type");
        }

        Map<String, Object> vote = jdbc.sql(
                "INSERT INTO votes (proposal_id, voter_id) VALUES (:proposalId, :userId) RETURNING *"
            )
            .param("proposalId", proposalId)
            .param("userId", userId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElseThrow();
        return Map.of("vote", vote);
    }

    @Transactional
    public void unvote(UUID userId, UUID planId, UUID proposalId) {
        basePlanRequired(planId);
        requireParticipant(userId, planId, "Only participants can vote");
        int deleted = jdbc.sql("DELETE FROM votes WHERE proposal_id = :proposalId AND voter_id = :userId")
            .param("proposalId", proposalId)
            .param("userId", userId)
            .update();
        if (deleted == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Vote not found");
        }
    }

    @Transactional
    public Map<String, Object> cancel(UUID userId, UUID planId) {
        Map<String, Object> plan = basePlanRequired(planId);
        if (!userId.toString().equals(plan.get("creator_id").toString())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Only creator can cancel");
        }
        String state = plan.get("lifecycle_state").toString();
        if (!"active".equals(state) && !"finalized".equals(state)) {
            throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_STATE",
                "Can only cancel active or finalized plans"
            );
        }
        jdbc.sql("UPDATE plans SET lifecycle_state = 'cancelled', updated_at = now() WHERE id = :planId")
            .param("planId", planId)
            .update();
        return Map.of("plan", getPlanFull(planId));
    }

    @Transactional
    public Map<String, Object> complete(UUID userId, UUID planId) {
        Map<String, Object> plan = basePlanRequired(planId);
        if (!userId.toString().equals(plan.get("creator_id").toString())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Only creator can complete");
        }
        String state = plan.get("lifecycle_state").toString();
        if (!"active".equals(state) && !"finalized".equals(state)) {
            throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_STATE",
                "Can only complete finalized or active plans"
            );
        }
        jdbc.sql("UPDATE plans SET lifecycle_state = 'completed', updated_at = now() WHERE id = :planId")
            .param("planId", planId)
            .update();
        return Map.of("plan", getPlanFull(planId));
    }

    public Map<String, Object> participants(UUID planId) {
        return Map.of("participants", participantRows(planId, null));
    }

    @Transactional
    public Map<String, Object> inviteParticipant(UUID userId, UUID planId, Map<String, Object> body) {
        UUID inviteeId = optionalUuid(body.get("user_id"));
        if (inviteeId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "user_id required");
        }

        Map<String, Object> plan = basePlanRequired(planId);
        if (!userId.toString().equals(plan.get("creator_id").toString())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Only creator can invite");
        }
        if (!"active".equals(plan.get("lifecycle_state").toString())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATE", "Can only invite in active plans");
        }

        boolean existing = jdbc.sql(
                "SELECT 1 FROM plan_participants WHERE plan_id = :planId AND user_id = :userId"
            )
            .param("planId", planId)
            .param("userId", inviteeId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .isPresent();
        if (existing) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_PARTICIPANT", "User is already a participant");
        }

        Number count = jdbc.sql("SELECT COUNT(*) FROM plan_participants WHERE plan_id = :planId")
            .param("planId", planId)
            .query(Number.class)
            .single();
        if (count.intValue() >= 15) {
            throw new ApiException(HttpStatus.CONFLICT, "PLAN_FULL", "Plan has max 15 participants");
        }

        jdbc.sql(
                """
                INSERT INTO plan_participants (plan_id, user_id, status)
                VALUES (:planId, :userId, 'invited')
                """
            )
            .param("planId", planId)
            .param("userId", inviteeId)
            .update();
        jdbc.sql(
                """
                INSERT INTO invitations (type, target_id, inviter_id, invitee_id, status)
                VALUES ('plan', :planId, :inviterId, :inviteeId, 'pending')
                """
            )
            .param("planId", planId)
            .param("inviterId", userId)
            .param("inviteeId", inviteeId)
            .update();
        String inviterName = jdbc.sql("SELECT name FROM users WHERE id = :userId")
            .param("userId", userId)
            .query(String.class)
            .optional()
            .orElse(null);
        insertNotification(inviteeId, "plan_invite", planInvitePayload(planId, inviterName));

        Map<String, Object> participant = participantRows(planId, inviteeId).stream()
            .findFirst()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Participant not found"));
        return Map.of("participant", participant);
    }

    @Transactional
    public Map<String, Object> updateParticipant(UUID userId, UUID planId, UUID participantId, Map<String, Object> body) {
        Map<String, Object> plan = basePlanRequired(planId);
        if (!participantId.equals(userId) && !userId.toString().equals(plan.get("creator_id").toString())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Cannot update this participant");
        }
        String status = optionalString(body.get("status"));
        if (!PARTICIPANT_STATUSES.contains(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATUS", "Invalid status");
        }
        jdbc.sql(
                """
                UPDATE plan_participants
                SET status = CAST(:status AS participant_status)
                WHERE plan_id = :planId AND user_id = :userId
                """
            )
            .param("status", status)
            .param("planId", planId)
            .param("userId", participantId)
            .update();
        Map<String, Object> participant = participantRows(planId, participantId).stream()
            .findFirst()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Participant not found"));
        return Map.of("participant", participant);
    }

    @Transactional
    public void removeParticipant(UUID userId, UUID planId, UUID participantId) {
        Map<String, Object> plan = basePlanRequired(planId);
        if (!userId.toString().equals(plan.get("creator_id").toString())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Cannot remove this participant");
        }
        jdbc.sql("DELETE FROM plan_participants WHERE plan_id = :planId AND user_id = :userId")
            .param("planId", planId)
            .param("userId", participantId)
            .update();
    }

    private Map<String, Object> planInvitePayload(UUID planId, String inviterName) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("plan_id", planId.toString());
        payload.put("inviter_name", inviterName);
        return payload;
    }

    private Map<String, Object> planJoinViaLinkPayload(UUID planId, UUID joinerId, String joinerName) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("plan_id", planId.toString());
        payload.put("joiner_id", joinerId.toString());
        payload.put("joiner_name", joinerName);
        return payload;
    }

    Map<String, Object> getPlanFullRequired(UUID planId) {
        Map<String, Object> plan = getPlanFull(planId);
        if (plan == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Plan not found");
        }
        return plan;
    }

    Map<String, Object> getPlanFull(UUID planId) {
        Map<String, Object> plan = jdbc.sql("SELECT * FROM plans WHERE id = :planId")
            .param("planId", planId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElse(null);
        if (plan == null) {
            return null;
        }
        LinkedHashMap<String, Object> full = new LinkedHashMap<>(plan);
        full.put("participants", participantRows(planId, null));
        full.put("proposals", proposals(planId));
        full.put("linked_event", linkedEvent(plan.get("linked_event_id")));
        return full;
    }

    private Map<String, Object> basePlanRequired(UUID planId) {
        Map<String, Object> plan = jdbc.sql("SELECT * FROM plans WHERE id = :planId")
            .param("planId", planId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElse(null);
        if (plan == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Plan not found");
        }
        return plan;
    }

    private List<Map<String, Object>> participantRows(UUID planId, UUID participantId) {
        String userFilter = participantId == null ? "" : " AND pp.user_id = :participantId";
        var statement = jdbc.sql(
                """
                SELECT pp.*,
                       u.id AS u_id, u.phone AS u_phone, u.name AS u_name, u.username AS u_username,
                       u.avatar_url AS u_avatar, u.created_at AS u_created
                FROM plan_participants pp
                JOIN users u ON pp.user_id = u.id
                WHERE pp.plan_id = :planId
                %s
                """.formatted(userFilter)
            )
            .param("planId", planId);
        if (participantId != null) {
            statement = statement.param("participantId", participantId);
        }
        return statement.query()
            .listOfRows()
            .stream()
            .map(this::participantRow)
            .toList();
    }

    private Map<String, Object> participantRow(Map<String, Object> row) {
        Map<String, Object> normalized = SqlRows.normalize(row);
        LinkedHashMap<String, Object> participant = new LinkedHashMap<>();
        participant.put("id", normalized.get("id"));
        participant.put("plan_id", normalized.get("plan_id"));
        participant.put("user_id", normalized.get("user_id"));
        participant.put("status", normalized.get("status"));
        participant.put("joined_at", normalized.get("joined_at"));
        LinkedHashMap<String, Object> user = new LinkedHashMap<>();
        user.put("id", normalized.get("u_id"));
        user.put("phone", normalized.get("u_phone"));
        user.put("name", normalized.get("u_name"));
        user.put("username", normalized.get("u_username"));
        user.put("avatar_url", normalized.get("u_avatar"));
        user.put("created_at", normalized.get("u_created"));
        participant.put("user", user);
        return participant;
    }

    private List<Map<String, Object>> proposals(UUID planId) {
        return proposals(planId, null, null);
    }

    private List<Map<String, Object>> proposals(UUID planId, String type, String status) {
        StringBuilder where = new StringBuilder("plan_id = :planId");
        if (type != null) {
            where.append(" AND type = CAST(:type AS proposal_type)");
        }
        if (status != null) {
            where.append(" AND status = CAST(:status AS proposal_status)");
        }
        var statement = jdbc.sql("SELECT * FROM plan_proposals WHERE " + where + " ORDER BY created_at ASC")
            .param("planId", planId);
        if (type != null) {
            statement = statement.param("type", type);
        }
        if (status != null) {
            statement = statement.param("status", status);
        }
        List<Map<String, Object>> proposals = statement.query()
            .listOfRows()
            .stream()
            .map(row -> (Map<String, Object>) new LinkedHashMap<String, Object>(SqlRows.normalize(row)))
            .toList();
        for (Map<String, Object> proposal : proposals) {
            List<Map<String, Object>> votes = jdbc.sql("SELECT * FROM votes WHERE proposal_id = :proposalId")
                .param("proposalId", UUID.fromString(proposal.get("id").toString()))
                .query()
                .listOfRows()
                .stream()
                .map(SqlRows::normalize)
                .toList();
            proposal.put("votes", votes);
        }
        return proposals;
    }


    private Map<String, Object> proposalRequired(UUID planId, UUID proposalId) {
        return jdbc.sql("SELECT * FROM plan_proposals WHERE id = :proposalId AND plan_id = :planId")
            .param("proposalId", proposalId)
            .param("planId", planId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Proposal not found"));
    }

    private Map<String, Object> findVote(UUID proposalId, UUID userId) {
        return jdbc.sql("SELECT * FROM votes WHERE proposal_id = :proposalId AND voter_id = :userId")
            .param("proposalId", proposalId)
            .param("userId", userId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElse(null);
    }

    private void validateProposalType(String type) {
        if (type != null && !Set.of("place", "time").contains(type)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "type must be place or time");
        }
    }

    private void validateProposalStatus(String status) {
        if (status != null && !Set.of("active", "finalized", "superseded").contains(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "Invalid proposal status");
        }
    }

    private void requireParticipant(UUID userId, UUID planId, String message) {
        boolean participant = jdbc.sql(
                "SELECT 1 FROM plan_participants WHERE plan_id = :planId AND user_id = :userId"
            )
            .param("planId", planId)
            .param("userId", userId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .isPresent();
        if (!participant) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
        }
    }

    private Map<String, Object> proposalCreatedPayload(UUID planId, String proposerName, String proposalType) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("plan_id", planId.toString());
        payload.put("proposer_name", proposerName);
        payload.put("proposal_type", proposalType);
        return payload;
    }

    private Map<String, Object> linkedEvent(Object linkedEventId) {
        if (linkedEventId == null) {
            return null;
        }
        UUID eventId = UUID.fromString(linkedEventId.toString());
        return jdbc.sql(
                """
                SELECT e.*,
                       v.id AS v_id, v.name AS v_name, v.description AS v_desc, v.address AS v_addr,
                       v.lat AS v_lat, v.lng AS v_lng, v.cover_image_url AS v_cover, v.created_at AS v_created
                FROM events e
                JOIN venues v ON e.venue_id = v.id
                WHERE e.id = :eventId
                """
            )
            .param("eventId", eventId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(this::eventWithVenue)
            .orElse(null);
    }

    private Map<String, Object> eventWithVenue(Map<String, Object> row) {
        Map<String, Object> normalized = SqlRows.normalize(row);
        LinkedHashMap<String, Object> event = new LinkedHashMap<>();
        event.put("id", normalized.get("id"));
        event.put("venue_id", normalized.get("venue_id"));
        event.put("title", normalized.get("title"));
        event.put("description", normalized.get("description"));
        event.put("cover_image_url", normalized.get("cover_image_url"));
        event.put("starts_at", normalized.get("starts_at"));
        event.put("ends_at", normalized.get("ends_at"));
        event.put("category", normalized.get("category"));
        event.put("tags", normalized.get("tags"));
        event.put("price_info", normalized.get("price_info"));
        event.put("external_url", normalized.get("external_url"));
        event.put("status", normalized.get("status"));
        event.put("cancelled_at", normalized.get("cancelled_at"));
        event.put("cancellation_reason", normalized.get("cancellation_reason"));
        event.put("created_at", normalized.get("created_at"));
        LinkedHashMap<String, Object> venue = new LinkedHashMap<>();
        venue.put("id", normalized.get("v_id"));
        venue.put("name", normalized.get("v_name"));
        venue.put("description", normalized.get("v_desc"));
        venue.put("address", normalized.get("v_addr"));
        venue.put("lat", normalized.get("v_lat"));
        venue.put("lng", normalized.get("v_lng"));
        venue.put("cover_image_url", normalized.get("v_cover"));
        venue.put("created_at", normalized.get("v_created"));
        event.put("venue", venue);
        event.put("friends_interested", List.of());
        event.put("friends_plan_count", 0);
        return event;
    }

    private Map<String, Object> planPreviewRow(Map<String, Object> row) {
        Map<String, Object> normalized = SqlRows.normalize(row);
        LinkedHashMap<String, Object> plan = new LinkedHashMap<>();
        plan.put("id", normalized.get("id"));
        plan.put("title", normalized.get("title"));
        plan.put("activity_type", normalized.get("activity_type"));
        plan.put("lifecycle_state", normalized.get("lifecycle_state"));
        plan.put("confirmed_place_text", normalized.get("confirmed_place_text"));
        plan.put("confirmed_time", normalized.get("confirmed_time"));
        plan.put("share_token", normalized.get("share_token"));
        if (normalized.get("u_id") == null) {
            plan.put("creator", null);
        } else {
            LinkedHashMap<String, Object> creator = new LinkedHashMap<>();
            creator.put("id", normalized.get("u_id"));
            creator.put("name", normalized.get("u_name"));
            creator.put("username", normalized.get("u_username"));
            creator.put("avatar_url", normalized.get("u_avatar"));
            plan.put("creator", creator);
        }
        plan.put("participant_count", normalized.get("participant_count"));
        plan.put("max_participants", 15);
        return plan;
    }

    private void insertNotification(UUID userId, String type, Map<String, Object> payload) {
        jdbc.sql(
                """
                INSERT INTO notifications (user_id, type, payload)
                VALUES (:userId, CAST(:type AS notification_type), CAST(:payload AS jsonb))
                """
            )
            .param("userId", userId)
            .param("type", type)
            .param("payload", writeJson(payload))
            .update();
    }

    private String writeJson(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize notification payload", exception);
        }
    }

    private List<UUID> participantIds(Object value, UUID currentUserId) {
        if (value == null) {
            return List.of();
        }
        if (!(value instanceof List<?> list)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "participant_ids must be an array");
        }
        List<UUID> ids = new ArrayList<>();
        for (Object item : list) {
            UUID id = optionalUuid(item);
            if (id != null && !currentUserId.equals(id)) {
                ids.add(id);
            }
        }
        return ids;
    }

    private String requiredString(Object value, String message) {
        if (!(value instanceof String string) || string.trim().isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", message);
        }
        return string;
    }

    private String optionalString(Object value) {
        if (value == null) {
            return null;
        }
        if (!(value instanceof String string)) {
            return null;
        }
        return string;
    }

    private UUID optionalUuid(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return UUID.fromString(value.toString());
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "Invalid UUID");
        }
    }

    private String validatedDate(Object value, String message) {
        if (value == null) {
            return null;
        }
        String text = value.toString();
        try {
            OffsetDateTime.parse(text);
            return text;
        } catch (RuntimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", message);
        }
    }

    private int parseInt(String value, int fallback) {
        if (value == null) {
            return fallback;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private String newShareToken() {
        byte[] bytes = new byte[8];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

}
