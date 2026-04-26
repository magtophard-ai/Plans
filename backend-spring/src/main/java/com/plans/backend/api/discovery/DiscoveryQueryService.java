package com.plans.backend.api.discovery;

import com.plans.backend.api.error.ApiException;
import com.plans.backend.persistence.SqlRows;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

@Service
public class DiscoveryQueryService {
    private final JdbcClient jdbc;

    public DiscoveryQueryService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, Object> listEvents(
        UUID userId,
        String category,
        String dateFrom,
        String dateTo,
        String page,
        String limit
    ) {
        QueryParts query = eventFilters(category, dateFrom, dateTo, null);
        Integer total = query.bind(
                jdbc.sql("SELECT COUNT(*) AS total FROM events e JOIN venues v ON e.venue_id = v.id WHERE " + query.where())
            )
            .query(Integer.class)
            .single();
        int offset = (parseInt(page, 1) - 1) * parseInt(limit, 20);
        int lmt = Math.min(parseInt(limit, 20), 100);
        var statement = query.bind(jdbc.sql(
                """
                SELECT e.*,
                       v.id AS v_id, v.name AS v_name, v.description AS v_desc, v.address AS v_addr,
                       v.lat AS v_lat, v.lng AS v_lng, v.cover_image_url AS v_cover, v.created_at AS v_created
                FROM events e
                JOIN venues v ON e.venue_id = v.id
                WHERE %s
                ORDER BY e.starts_at DESC
                LIMIT :limit OFFSET :offset
                """.formatted(query.where())
            ))
            .param("limit", lmt)
            .param("offset", offset);
        List<Map<String, Object>> rows = statement.query().listOfRows();
        return eventsResponse(rows, userId, total);
    }

    public Map<String, Object> searchEvents(
        UUID userId,
        String q,
        String category,
        String dateFrom,
        String dateTo,
        String page,
        String limit
    ) {
        QueryParts query = eventFilters(category, dateFrom, dateTo, q);
        Integer total = query.bind(
                jdbc.sql("SELECT COUNT(*) AS total FROM events e JOIN venues v ON e.venue_id = v.id WHERE " + query.where())
            )
            .query(Integer.class)
            .single();
        int offset = (parseInt(page, 1) - 1) * parseInt(limit, 20);
        int lmt = Math.min(parseInt(limit, 20), 100);
        var statement = query.bind(jdbc.sql(
                """
                SELECT e.*,
                       v.id AS v_id, v.name AS v_name, v.description AS v_desc, v.address AS v_addr,
                       v.lat AS v_lat, v.lng AS v_lng, v.cover_image_url AS v_cover, v.created_at AS v_created
                FROM events e
                JOIN venues v ON e.venue_id = v.id
                WHERE %s
                ORDER BY e.starts_at DESC
                LIMIT :limit OFFSET :offset
                """.formatted(query.where())
            ))
            .param("limit", lmt)
            .param("offset", offset);
        List<Map<String, Object>> events = statement.query().listOfRows().stream()
            .map(this::eventWithVenue)
            .map(event -> withSearchSocialDefaults(event))
            .toList();
        return Map.of("events", events, "total", total);
    }

    public Map<String, Object> event(UUID userId, UUID eventId) {
        List<Map<String, Object>> events = jdbc.sql(
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
            .listOfRows();
        Map<String, Object> row = events.stream()
            .findFirst()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Event not found"));
        Map<String, Object> event = eventWithVenue(row);
        Map<String, Object> social = socialProof(List.of(eventId), userId).get(eventId.toString());
        event.putAll(social);
        return Map.of("event", event);
    }

    public Map<String, Object> venue(UUID venueId) {
        List<Map<String, Object>> venues = jdbc.sql("SELECT * FROM venues WHERE id = :venueId")
            .param("venueId", venueId)
            .query()
            .listOfRows();
        Map<String, Object> venue = venues.stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Venue not found"));
        return Map.of("venue", venue);
    }

    public Map<String, Object> venueEvents(UUID venueId, String page, String limit) {
        Integer total = jdbc.sql("SELECT COUNT(*) AS total FROM events WHERE venue_id = :venueId AND status = 'published'")
            .param("venueId", venueId)
            .query(Integer.class)
            .single();
        int offset = (parseInt(page, 1) - 1) * parseInt(limit, 20);
        int lmt = Math.min(parseInt(limit, 20), 100);
        List<Map<String, Object>> events = jdbc.sql(
                """
                SELECT * FROM events
                WHERE venue_id = :venueId AND status = 'published'
                ORDER BY starts_at DESC
                LIMIT :limit OFFSET :offset
                """
            )
            .param("venueId", venueId)
            .param("limit", lmt)
            .param("offset", offset)
            .query()
            .listOfRows()
            .stream()
            .map(SqlRows::normalize)
            .toList();
        return Map.of("events", events, "total", total);
    }

    private Map<String, Object> eventsResponse(List<Map<String, Object>> rows, UUID userId, int total) {
        List<UUID> eventIds = rows.stream()
            .map(row -> (UUID) row.get("id"))
            .toList();
        Map<String, Map<String, Object>> socialProof = socialProof(eventIds, userId);
        List<Map<String, Object>> events = rows.stream()
            .map(this::eventWithVenue)
            .peek(event -> event.putAll(socialProof.get(event.get("id"))))
            .toList();
        return Map.of("events", events, "total", total);
    }

    private Map<String, Object> eventWithVenue(Map<String, Object> row) {
        Map<String, Object> event = SqlRows.normalize(row);
        event.remove("v_id");
        event.remove("v_name");
        event.remove("v_desc");
        event.remove("v_addr");
        event.remove("v_lat");
        event.remove("v_lng");
        event.remove("v_cover");
        event.remove("v_created");
        event.put("venue", Map.of(
            "id", normalize(row.get("v_id")),
            "name", normalize(row.get("v_name")),
            "description", normalize(row.get("v_desc")),
            "address", normalize(row.get("v_addr")),
            "lat", normalize(row.get("v_lat")),
            "lng", normalize(row.get("v_lng")),
            "cover_image_url", normalize(row.get("v_cover")),
            "created_at", normalize(row.get("v_created"))
        ));
        return event;
    }

    private Map<String, Object> withSearchSocialDefaults(Map<String, Object> event) {
        event.put("friends_interested", List.of());
        event.put("friends_plan_count", 0);
        return event;
    }

    private Map<String, Map<String, Object>> socialProof(List<UUID> eventIds, UUID userId) {
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        for (UUID eventId : eventIds) {
            result.put(eventId.toString(), new LinkedHashMap<>(Map.of(
                "friends_interested", new ArrayList<>(),
                "friends_plan_count", 0
            )));
        }
        if (eventIds.isEmpty()) {
            return result;
        }

        jdbc.sql(
                """
                SELECT ei.event_id, u.id, u.phone, u.name, u.username, u.avatar_url, u.created_at
                FROM event_interests ei
                JOIN friendships f ON (ei.user_id = f.requester_id OR ei.user_id = f.addressee_id)
                JOIN users u ON u.id = ei.user_id
                WHERE ei.event_id IN (:eventIds)
                  AND f.status = 'accepted'
                  AND (f.requester_id = :userId OR f.addressee_id = :userId)
                  AND ei.user_id != :userId
                """
            )
            .param("eventIds", eventIds)
            .param("userId", userId)
            .query()
            .listOfRows()
            .forEach(row -> {
                String eventId = row.get("event_id").toString();
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> friends = (List<Map<String, Object>>) result.get(eventId).get("friends_interested");
                Map<String, Object> friend = SqlRows.normalize(row);
                friend.remove("event_id");
                friends.add(friend);
            });

        jdbc.sql(
                """
                SELECT p.linked_event_id AS event_id, COUNT(DISTINCT pp.user_id) AS cnt
                FROM plans p
                JOIN plan_participants pp ON pp.plan_id = p.id
                WHERE p.linked_event_id IN (:eventIds) AND pp.user_id != :userId
                GROUP BY p.linked_event_id
                """
            )
            .param("eventIds", eventIds)
            .param("userId", userId)
            .query()
            .listOfRows()
            .forEach(row -> result.get(row.get("event_id").toString()).put("friends_plan_count", ((Number) row.get("cnt")).intValue()));
        return result;
    }

    private QueryParts eventFilters(String category, String dateFrom, String dateTo, String q) {
        StringBuilder where = new StringBuilder("e.status = 'published'");
        Map<String, Object> params = new LinkedHashMap<>();
        if (q != null && !q.isBlank()) {
            where.append(" AND (e.title ILIKE :q OR array_to_string(e.tags, ' ') ILIKE :q OR v.name ILIKE :q)");
            params.put("q", "%" + q + "%");
        }
        if (category != null && !category.isBlank()) {
            where.append(" AND e.category = CAST(:category AS event_category)");
            params.put("category", category);
        }
        if (dateFrom != null && !dateFrom.isBlank()) {
            where.append(" AND e.starts_at >= CAST(:dateFrom AS timestamptz)");
            params.put("dateFrom", dateFrom);
        }
        if (dateTo != null && !dateTo.isBlank()) {
            where.append(" AND e.starts_at <= CAST(:dateTo AS timestamptz)");
            params.put("dateTo", dateTo);
        }
        return new QueryParts(where.toString(), params);
    }

    private int parseInt(String value, int defaultValue) {
        try {
            return value == null ? defaultValue : Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            return defaultValue;
        }
    }

    private Object normalize(Object value) {
        return SqlRows.normalize(Map.of("value", value)).get("value");
    }

    private record QueryParts(String where, Map<String, Object> params) {
        JdbcClient.StatementSpec bind(JdbcClient.StatementSpec statement) {
            JdbcClient.StatementSpec bound = statement;
            for (Map.Entry<String, Object> entry : params.entrySet()) {
                bound = bound.param(entry.getKey(), entry.getValue());
            }
            return bound;
        }
    }
}
