package com.plans.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plans.backend.api.error.ApiException;
import com.plans.backend.api.realtime.RealtimeEventPublisher;
import com.plans.backend.persistence.SqlRows;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    private final JdbcClient jdbc;
    private final ObjectMapper objectMapper;
    private final RealtimeEventPublisher realtime;

    public NotificationService(JdbcClient jdbc, ObjectMapper objectMapper, RealtimeEventPublisher realtime) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.realtime = realtime;
    }

    public Map<String, Object> list(UUID userId, String page, String limit) {
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
            .param("userId", userId)
            .param("limit", lmt)
            .param("offset", offset)
            .query()
            .listOfRows()
            .stream()
            .map(this::notificationRow)
            .toList();
        Number unreadCount = jdbc.sql("SELECT COUNT(*) FROM notifications WHERE user_id = :userId AND read = false")
            .param("userId", userId)
            .query(Number.class)
            .single();
        return Map.of("notifications", notifications, "unread_count", unreadCount.intValue());
    }

    @Transactional
    public Map<String, Object> read(UUID userId, UUID id) {
        Map<String, Object> notification = jdbc.sql(
                """
                UPDATE notifications
                SET read = true
                WHERE id = :id AND user_id = :userId
                RETURNING *
                """
            )
            .param("id", id)
            .param("userId", userId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(this::notificationRow)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Notification not found"));
        return Map.of("notification", notification);
    }

    @Transactional
    public Map<String, Object> readAll(UUID userId) {
        jdbc.sql("UPDATE notifications SET read = true WHERE user_id = :userId AND read = false")
            .param("userId", userId)
            .update();
        return Map.of();
    }

    public void create(UUID userId, String type, Map<String, Object> payload) {
        Map<String, Object> notification = jdbc.sql(
                """
                INSERT INTO notifications (user_id, type, payload)
                VALUES (:userId, CAST(:type AS notification_type), CAST(:payload AS jsonb))
                RETURNING *
                """
            )
            .param("userId", userId)
            .param("type", type)
            .param("payload", writeJson(payload))
            .query()
            .singleRow();
        realtime.emitAfterCommit("user:" + userId, "notification.created", Map.of(
            "notificationId", notification.get("id").toString(),
            "type", type,
            "payload", payload,
            "createdAt", notificationRow(notification).get("created_at")
        ));
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

    private String writeJson(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize notification payload", exception);
        }
    }

    private int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }
}
