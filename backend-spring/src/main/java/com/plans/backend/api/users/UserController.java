package com.plans.backend.api.users;

import com.plans.backend.api.auth.AuthenticatedUser;
import com.plans.backend.api.error.ApiException;
import com.plans.backend.persistence.SqlRows;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final JdbcClient jdbc;

    public UserController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/me")
    Map<String, Object> me(AuthenticatedUser authenticatedUser) {
        return Map.of("user", findRequiredUser(authenticatedUser.id()));
    }

    @GetMapping("/friends")
    Map<String, Object> friends(
        AuthenticatedUser authenticatedUser,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String direction
    ) {
        if (status != null && !"accepted".equals(status) && !"pending".equals(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "status must be accepted or pending");
        }
        if (direction != null && !"incoming".equals(direction) && !"outgoing".equals(direction)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "direction must be incoming or outgoing");
        }

        StringBuilder filters = new StringBuilder(
            """
            (
              (f.requester_id = :userId AND f.addressee_id = u.id) OR
              (f.addressee_id = :userId AND f.requester_id = u.id)
            )
            """
        );
        if (status != null) {
            filters.append(" AND f.status = :status");
        }
        if ("incoming".equals(direction)) {
            filters.append(" AND f.addressee_id = :userId");
        } else if ("outgoing".equals(direction)) {
            filters.append(" AND f.requester_id = :userId");
        }

        var statement = jdbc.sql(
                """
                SELECT u.*,
                       CASE
                         WHEN f.status = 'accepted' THEN 'friend'
                         WHEN f.status = 'pending' AND f.requester_id = :userId THEN 'request_sent'
                         WHEN f.status = 'pending' AND f.addressee_id = :userId THEN 'request_received'
                         ELSE NULL
                       END AS friendship_status
                FROM users u
                JOIN friendships f ON %s
                ORDER BY u.name ASC, u.created_at ASC
                """.formatted(filters)
            )
            .param("userId", authenticatedUser.id());
        if (status != null) {
            statement = statement.param("status", status);
        }
        List<Map<String, Object>> friends = statement.query().listOfRows().stream()
            .map(SqlRows::normalize)
            .toList();
        return Map.of("friends", friends);
    }

    @GetMapping("/{id}")
    Map<String, Object> user(AuthenticatedUser authenticatedUser, @PathVariable String id) {
        UUID requestedUserId = parseUuid(id);
        List<Map<String, Object>> users = jdbc.sql(
                """
                SELECT u.*,
                       CASE
                         WHEN f.status = 'accepted' THEN 'friend'
                         WHEN f.status = 'pending' AND f.requester_id = :userId THEN 'request_sent'
                         WHEN f.status = 'pending' AND f.addressee_id = :userId THEN 'request_received'
                         ELSE NULL
                       END AS friendship_status
                FROM users u
                LEFT JOIN friendships f ON (
                  (f.requester_id = :userId AND f.addressee_id = u.id) OR
                  (f.addressee_id = :userId AND f.requester_id = u.id)
                )
                WHERE u.id = :requestedUserId
                """
            )
            .param("userId", authenticatedUser.id())
            .param("requestedUserId", requestedUserId)
            .query()
            .listOfRows();
        Map<String, Object> user = users.stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "User not found"));
        return Map.of("user", user);
    }

    private Map<String, Object> findRequiredUser(UUID userId) {
        List<Map<String, Object>> users = jdbc.sql("SELECT * FROM users WHERE id = :userId")
            .param("userId", userId)
            .query()
            .listOfRows();
        return users.stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "User not found"));
    }

    private UUID parseUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "id must be a valid uuid");
        }
    }
}
