package com.plans.backend.api.notifications;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plans.backend.api.auth.AuthenticatedUser;
import com.plans.backend.api.error.ApiException;
import com.plans.backend.persistence.SqlRows;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final JdbcClient jdbc;
    private final ObjectMapper objectMapper;

    public NotificationController(JdbcClient jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    Map<String, Object> list(
        AuthenticatedUser authenticatedUser,
        @RequestParam(defaultValue = "1") String page,
        @RequestParam(defaultValue = "50") String limit
    ) {
        int offset = (parseInt(page, 1) - 1) * parseInt(limit, 50);
        int lmt = Math.min(parseInt(limit, 50), 100);
        List<Map<String, Object>> notifications = jdbc.sql(
                """
                SELECT *
                FROM notifications
                WHERE user_id = :userId
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
                """
            )
            .param("userId", authenticatedUser.id())
            .param("limit", lmt)
            .param("offset", offset)
            .query()
            .listOfRows()
            .stream()
            .map(this::notificationRow)
            .toList();
        Number unreadCount = jdbc.sql("SELECT COUNT(*) FROM notifications WHERE user_id = :userId AND read = false")
            .param("userId", authenticatedUser.id())
            .query(Number.class)
            .single();
        return Map.of("notifications", notifications, "unread_count", unreadCount.intValue());
    }

    @PatchMapping("/{id}/read")
    Map<String, Object> read(AuthenticatedUser authenticatedUser, @PathVariable UUID id) {
        Map<String, Object> notification = jdbc.sql(
                """
                UPDATE notifications
                SET read = true
                WHERE id = :id AND user_id = :userId
                RETURNING *
                """
            )
            .param("id", id)
            .param("userId", authenticatedUser.id())
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(this::notificationRow)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Notification not found"));
        return Map.of("notification", notification);
    }

    @PatchMapping("/read-all")
    Map<String, Object> readAll(AuthenticatedUser authenticatedUser) {
        jdbc.sql("UPDATE notifications SET read = true WHERE user_id = :userId AND read = false")
            .param("userId", authenticatedUser.id())
            .update();
        return Map.of();
    }

    private Map<String, Object> notificationRow(Map<String, Object> row) {
        Map<String, Object> normalized = SqlRows.normalize(row);
        LinkedHashMap<String, Object> notification = new LinkedHashMap<>(normalized);
        Object payload = normalized.get("payload");
        if (payload instanceof String json) {
            try {
                notification.put("payload", objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
                }));
            } catch (JsonProcessingException exception) {
                throw new IllegalStateException("Failed to parse notification payload", exception);
            }
        }
        return notification;
    }

    private int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }
}
