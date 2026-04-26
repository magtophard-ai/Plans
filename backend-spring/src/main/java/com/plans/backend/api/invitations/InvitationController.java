package com.plans.backend.api.invitations;

import com.plans.backend.api.auth.AuthenticatedUser;
import com.plans.backend.api.error.ApiException;
import com.plans.backend.persistence.SqlRows;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/invitations")
public class InvitationController {
    private final JdbcClient jdbc;
    public InvitationController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    Map<String, Object> list(AuthenticatedUser authenticatedUser, @RequestParam(required = false) String status) {
        var statement = jdbc.sql(
                """
                SELECT i.*
                FROM invitations i
                WHERE i.invitee_id = :userId
                %s
                ORDER BY i.created_at DESC
                """.formatted(status == null ? "" : "AND i.status = CAST(:status AS invitation_status)")
            )
            .param("userId", authenticatedUser.id());
        if (status != null) {
            statement = statement.param("status", status);
        }
        List<Map<String, Object>> invitations = statement.query()
            .listOfRows()
            .stream()
            .map(this::invitationWithTarget)
            .toList();
        return Map.of("invitations", invitations);
    }

    @PatchMapping("/{id}")
    @Transactional
    Map<String, Object> update(
        AuthenticatedUser authenticatedUser,
        @PathVariable UUID id,
        @RequestBody(required = false) Map<String, Object> body
    ) {
        String status = body == null ? null : string(body.get("status"));
        if (!"accepted".equals(status) && !"declined".equals(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATUS", "Must be accepted or declined");
        }

        Map<String, Object> invitation = jdbc.sql("SELECT * FROM invitations WHERE id = :id")
            .param("id", id)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Invitation not found"));
        if (!authenticatedUser.id().toString().equals(invitation.get("invitee_id").toString())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Not your invitation");
        }
        if (!"pending".equals(invitation.get("status"))) {
            throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "ALREADY_RESPONDED",
                "Invitation already responded to"
            );
        }

        if ("declined".equals(status)) {
            jdbc.sql("UPDATE invitations SET status = 'declined' WHERE id = :id")
                .param("id", id)
                .update();
            return Map.of("invitation", invitationWithNullTargets(id));
        }

        if ("plan".equals(invitation.get("type"))) {
            UUID planId = UUID.fromString(invitation.get("target_id").toString());
            Map<String, Object> plan = jdbc.sql("SELECT id FROM plans WHERE id = :planId FOR UPDATE")
                .param("planId", planId)
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Plan not found"));
            if (plan.isEmpty()) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Plan not found");
            }

            boolean existing = jdbc.sql(
                    "SELECT 1 FROM plan_participants WHERE plan_id = :planId AND user_id = :userId"
                )
                .param("planId", planId)
                .param("userId", authenticatedUser.id())
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .isPresent();
            if (!existing) {
                Number count = jdbc.sql("SELECT COUNT(*) FROM plan_participants WHERE plan_id = :planId")
                    .param("planId", planId)
                    .query(Number.class)
                    .single();
                if (count.intValue() >= 15) {
                    throw new ApiException(HttpStatus.CONFLICT, "PLAN_FULL", "Plan has max 15 participants");
                }
            }

            jdbc.sql("UPDATE invitations SET status = 'accepted' WHERE id = :id")
                .param("id", id)
                .update();
            jdbc.sql(
                    """
                    INSERT INTO plan_participants (plan_id, user_id, status)
                    VALUES (:planId, :userId, 'going')
                    ON CONFLICT (plan_id, user_id) DO UPDATE SET status = 'going'
                    """
                )
                .param("planId", planId)
                .param("userId", authenticatedUser.id())
                .update();
        } else if ("group".equals(invitation.get("type"))) {
            jdbc.sql("UPDATE invitations SET status = 'accepted' WHERE id = :id")
                .param("id", id)
                .update();
            jdbc.sql(
                    """
                    INSERT INTO group_members (group_id, user_id, role)
                    VALUES (:groupId, :userId, 'member')
                    ON CONFLICT (group_id, user_id) DO NOTHING
                    """
                )
                .param("groupId", UUID.fromString(invitation.get("target_id").toString()))
                .param("userId", authenticatedUser.id())
                .update();
        }

        return Map.of("invitation", invitationWithTarget(findInvitation(id)));
    }

    private Map<String, Object> invitationWithNullTargets(UUID id) {
        Map<String, Object> invitation = new LinkedHashMap<>(findInvitation(id));
        invitation.put("plan", null);
        invitation.put("group", null);
        return invitation;
    }

    private Map<String, Object> findInvitation(UUID id) {
        return jdbc.sql("SELECT * FROM invitations WHERE id = :id")
            .param("id", id)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElseThrow();
    }

    private Map<String, Object> invitationWithTarget(Map<String, Object> row) {
        Map<String, Object> invitation = new LinkedHashMap<>(SqlRows.normalize(row));
        Object plan = null;
        Object group = null;
        UUID targetId = UUID.fromString(invitation.get("target_id").toString());
        if ("plan".equals(invitation.get("type"))) {
            plan = jdbc.sql(
                    """
                    SELECT id, title, activity_type, lifecycle_state, creator_id, created_at
                    FROM plans
                    WHERE id = :planId
                    """
                )
                .param("planId", targetId)
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .map(SqlRows::normalize)
                .orElse(null);
        } else if ("group".equals(invitation.get("type"))) {
            group = jdbc.sql("SELECT id, name, creator_id, avatar_url, created_at FROM groups WHERE id = :groupId")
                .param("groupId", targetId)
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .map(SqlRows::normalize)
                .orElse(null);
        }
        invitation.put("plan", plan);
        invitation.put("group", group);
        return invitation;
    }

    private String string(Object value) {
        return value instanceof String text ? text : null;
    }
}
