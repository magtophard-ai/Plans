package com.plans.backend.api.users;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plans.backend.api.auth.AuthenticatedUser;
import com.plans.backend.api.error.ApiException;
import com.plans.backend.persistence.SqlRows;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private static final Logger LOGGER = LoggerFactory.getLogger(UserController.class);
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[a-zA-Z0-9_]{1,50}$");

    private final JdbcClient jdbc;
    private final ObjectMapper objectMapper;

    public UserController(JdbcClient jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/me")
    Map<String, Object> me(AuthenticatedUser authenticatedUser) {
        return Map.of("user", findRequiredUser(authenticatedUser.id()));
    }

    @PatchMapping("/me")
    Map<String, Object> updateMe(
        AuthenticatedUser authenticatedUser,
        @RequestBody(required = false) Map<String, Object> body
    ) {
        Map<String, Object> values = body == null ? Map.of() : body;
        Map<String, Object> current = findRequiredUser(authenticatedUser.id());

        boolean hasName = values.containsKey("name");
        boolean hasUsername = values.containsKey("username");
        boolean hasAvatarUrl = values.containsKey("avatar_url");
        if (!hasName && !hasUsername && !hasAvatarUrl) {
            return Map.of("user", current);
        }

        String name = hasName ? validatedName(values.get("name")) : current.get("name").toString();
        String username = hasUsername ? validatedUsername(values.get("username")) : current.get("username").toString();
        Object avatarUrl = hasAvatarUrl ? validatedAvatarUrl(values.get("avatar_url")) : current.get("avatar_url");

        if (hasUsername && !username.equals(current.get("username")) && usernameTaken(username, authenticatedUser.id())) {
            throw new ApiException(HttpStatus.CONFLICT, "USERNAME_TAKEN", "Username already taken");
        }

        try {
            Map<String, Object> user = jdbc.sql(
                    """
                    UPDATE users
                    SET name = :name, username = :username, avatar_url = :avatarUrl
                    WHERE id = :userId
                    RETURNING *
                    """
                )
                .param("name", name)
                .param("username", username)
                .param("avatarUrl", avatarUrl)
                .param("userId", authenticatedUser.id())
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .map(SqlRows::normalize)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "User not found"));
            return Map.of("user", user);
        } catch (DuplicateKeyException exception) {
            throw new ApiException(HttpStatus.CONFLICT, "USERNAME_TAKEN", "Username already taken");
        }
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

    @PostMapping("/friends/{id}")
    ResponseEntity<Map<String, Object>> sendFriendRequest(AuthenticatedUser authenticatedUser, @PathVariable String id) {
        UUID friendId = parseUuid(id);
        UUID userId = authenticatedUser.id();
        if (friendId.equals(userId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "Cannot add yourself as friend");
        }
        ensureUserExists(friendId);
        Map<String, Object> me = findRequiredUser(userId);

        Map<String, Object> existing = friendshipBetween(userId, friendId);
        if (existing != null) {
            String status = existing.get("status").toString();
            UUID requesterId = (UUID) existing.get("requester_id");
            if ("accepted".equals(status)) {
                return conflict("ALREADY_FRIENDS", "Already friends", existing);
            }
            if (requesterId.equals(userId)) {
                return conflict("REQUEST_ALREADY_SENT", "Friend request already sent", existing);
            }
            Map<String, Object> updated = jdbc.sql("UPDATE friendships SET status = 'accepted' WHERE id = :id RETURNING *")
                .param("id", existing.get("id"))
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No pending request from this user"));
            insertNotification(requesterId, "friend_accepted", Map.of(
                "friendship_id", updated.get("id"),
                "accepter_id", userId,
                "accepter_name", me.get("name"),
                "accepter_username", me.get("username")
            ), "failed to insert friend_accepted notification (auto-accept)");
            return ResponseEntity.ok(Map.of("friendship", SqlRows.normalize(updated)));
        }

        Map<String, Object> friendship = jdbc.sql(
                """
                INSERT INTO friendships (requester_id, addressee_id, status)
                VALUES (:userId, :friendId, 'pending')
                RETURNING *
                """
            )
            .param("userId", userId)
            .param("friendId", friendId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .orElseThrow();
        insertNotification(friendId, "friend_request", Map.of(
            "friendship_id", friendship.get("id"),
            "requester_id", userId,
            "requester_name", me.get("name"),
            "requester_username", me.get("username")
        ), "failed to insert friend_request notification");
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("friendship", SqlRows.normalize(friendship)));
    }

    @PatchMapping("/friends/{id}")
    ResponseEntity<?> respondToFriendRequest(
        AuthenticatedUser authenticatedUser,
        @PathVariable String id,
        @RequestParam(required = false) String action,
        @RequestBody(required = false) Map<String, Object> body
    ) {
        UUID friendId = parseUuid(id);
        String requestedAction = actionFrom(action, body);
        if (!"accept".equals(requestedAction) && !"decline".equals(requestedAction)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "action must be 'accept' or 'decline'");
        }

        Map<String, Object> existing = jdbc.sql(
                """
                SELECT * FROM friendships
                WHERE requester_id = :friendId AND addressee_id = :userId AND status = 'pending'
                """
            )
            .param("friendId", friendId)
            .param("userId", authenticatedUser.id())
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No pending request from this user"));

        if ("decline".equals(requestedAction)) {
            jdbc.sql("DELETE FROM friendships WHERE id = :id")
                .param("id", existing.get("id"))
                .update();
            return ResponseEntity.noContent().build();
        }

        Map<String, Object> updated = jdbc.sql("UPDATE friendships SET status = 'accepted' WHERE id = :id RETURNING *")
            .param("id", existing.get("id"))
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No pending request from this user"));
        Map<String, Object> me = findRequiredUser(authenticatedUser.id());
        insertNotification(friendId, "friend_accepted", Map.of(
            "friendship_id", updated.get("id"),
            "accepter_id", authenticatedUser.id(),
            "accepter_name", me.get("name"),
            "accepter_username", me.get("username")
        ), "failed to insert friend_accepted notification");
        return ResponseEntity.ok(Map.of("friendship", SqlRows.normalize(updated)));
    }

    @DeleteMapping("/friends/{id}")
    ResponseEntity<Void> removeFriend(AuthenticatedUser authenticatedUser, @PathVariable String id) {
        UUID friendId = parseUuid(id);
        UUID userId = authenticatedUser.id();
        if (friendId.equals(userId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "Cannot remove yourself as friend");
        }
        jdbc.sql(
                """
                DELETE FROM friendships
                WHERE (requester_id = :userId AND addressee_id = :friendId)
                   OR (requester_id = :friendId AND addressee_id = :userId)
                """
            )
            .param("userId", userId)
            .param("friendId", friendId)
            .update();
        return ResponseEntity.noContent().build();
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

    private String validatedName(Object value) {
        if (!(value instanceof String name) || name.trim().isEmpty() || name.length() > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "name must be 1-100 chars");
        }
        return name;
    }

    private String validatedUsername(Object value) {
        if (!(value instanceof String username) || !USERNAME_PATTERN.matcher(username).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "username must be 1-50 alphanumeric/underscore chars");
        }
        return username;
    }

    private Object validatedAvatarUrl(Object value) {
        if (value == null) {
            return null;
        }
        if (!(value instanceof String avatarUrl) || avatarUrl.length() > 500) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "avatar_url must be null or string <= 500 chars");
        }
        return avatarUrl;
    }

    private boolean usernameTaken(String username, UUID userId) {
        Integer count = jdbc.sql("SELECT COUNT(*) FROM users WHERE username = :username AND id != :userId")
            .param("username", username)
            .param("userId", userId)
            .query(Integer.class)
            .single();
        return count > 0;
    }

    private void ensureUserExists(UUID userId) {
        Integer count = jdbc.sql("SELECT COUNT(*) FROM users WHERE id = :userId")
            .param("userId", userId)
            .query(Integer.class)
            .single();
        if (count == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "User not found");
        }
    }

    private Map<String, Object> friendshipBetween(UUID userId, UUID friendId) {
        return jdbc.sql(
                """
                SELECT * FROM friendships
                WHERE (requester_id = :userId AND addressee_id = :friendId)
                   OR (requester_id = :friendId AND addressee_id = :userId)
                LIMIT 1
                """
            )
            .param("userId", userId)
            .param("friendId", friendId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .orElse(null);
    }

    private ResponseEntity<Map<String, Object>> conflict(String code, String message, Map<String, Object> friendship) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
            "code", code,
            "message", message,
            "friendship", SqlRows.normalize(friendship)
        ));
    }

    private void insertNotification(UUID userId, String type, Map<String, Object> payload, String logMessage) {
        try {
            jdbc.sql(
                    """
                    INSERT INTO notifications (user_id, type, payload)
                    VALUES (:userId, CAST(:type AS notification_type), CAST(:payload AS jsonb))
                    """
                )
                .param("userId", userId)
                .param("type", type)
                .param("payload", objectMapper.writeValueAsString(payload))
                .update();
        } catch (Exception exception) {
            LOGGER.error(logMessage, exception);
        }
    }

    private String actionFrom(String action, Map<String, Object> body) {
        if (action != null) {
            return action;
        }
        if (body == null || !body.containsKey("action")) {
            return null;
        }
        Object value = body.get("action");
        if (value instanceof String bodyAction) {
            return bodyAction;
        }
        return null;
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
