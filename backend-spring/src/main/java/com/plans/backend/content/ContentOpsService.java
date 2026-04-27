package com.plans.backend.content;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plans.backend.api.error.ApiException;
import com.plans.backend.persistence.SqlRows;
import com.plans.backend.service.NotificationService;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ContentOpsService {
    private static final Set<String> EVENT_CATEGORIES = Set.of(
        "music",
        "theatre",
        "exhibition",
        "sport",
        "food",
        "party",
        "workshop",
        "other"
    );
    private static final Set<String> INGESTION_STATES = Set.of("imported", "duplicate", "published", "cancelled");

    private final JdbcClient jdbc;
    private final ObjectMapper objectMapper;
    private final NotificationService notificationService;

    public ContentOpsService(
        JdbcClient jdbc,
        ObjectMapper objectMapper,
        NotificationService notificationService
    ) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.notificationService = notificationService;
    }

    public Map<String, Object> readNormalizedEventFile(Path filePath) {
        try {
            JsonNode raw = objectMapper.readTree(Files.readString(filePath));
            NormalizedEventInput normalized = normalizeInput(raw);
            return Map.of("raw", raw, "normalized", normalized);
        } catch (IOException exception) {
            throw new IllegalArgumentException(exception.getMessage(), exception);
        }
    }

    @Transactional
    public Map<String, Object> importNormalizedEvent(Object rawPayload) {
        NormalizedEventInput normalized = normalizeInput(rawPayload);
        String fingerprint = buildFingerprint(normalized);
        String sourceKey = normalized.sourceEventKey();
        Map<String, Object> existing = sourceKey == null ? null : jdbc.sql(
                """
                SELECT *
                FROM event_ingestions
                WHERE source_type = :sourceType AND source_event_key = :sourceEventKey
                """
            )
            .param("sourceType", normalized.sourceType())
            .param("sourceEventKey", sourceKey)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .orElse(null);

        if (existing != null) {
            Map<String, Object> existingRow = ingestionRow(existing);
            UUID linkedEventId = uuidOrNull(existingRow.get("linked_event_id"));
            UUID duplicateOfEventId = linkedEventId == null ? findFingerprintDuplicate(normalized, fingerprint, null) : null;
            String nextState = linkedEventId != null
                ? ("cancelled".equals(existingRow.get("state")) ? "cancelled" : "published")
                : (duplicateOfEventId == null ? "imported" : "duplicate");
            Map<String, Object> updated = jdbc.sql(
                    """
                    UPDATE event_ingestions
                    SET source_url = :sourceUrl,
                        raw_payload = CAST(:rawPayload AS jsonb),
                        title = :title,
                        description = :description,
                        starts_at = :startsAt,
                        ends_at = :endsAt,
                        venue_name = :venueName,
                        address = :address,
                        cover_image_url = :coverImageUrl,
                        external_url = :externalUrl,
                        category = CAST(:category AS event_category),
                        tags = :tags,
                        price_info = :priceInfo,
                        fingerprint = :fingerprint,
                        state = :state,
                        duplicate_of_event_id = :duplicateOfEventId,
                        operator_note = :operatorNote,
                        last_seen_at = now(),
                        updated_at = now()
                    WHERE id = :id
                    RETURNING *
                    """
                )
                .param("id", uuidOrNull(existingRow.get("id")))
                .param("sourceUrl", normalized.sourceUrl())
                .param("rawPayload", writeJson(rawPayload))
                .param("title", normalized.title())
                .param("description", normalized.description())
                .param("startsAt", normalized.startsAt())
                .param("endsAt", normalized.endsAt())
                .param("venueName", normalized.venueName())
                .param("address", normalized.address())
                .param("coverImageUrl", normalized.coverImageUrl())
                .param("externalUrl", normalized.externalUrl())
                .param("category", normalized.category())
                .param("tags", sqlTextArray(normalized.tags()))
                .param("priceInfo", normalized.priceInfo())
                .param("fingerprint", fingerprint)
                .param("state", nextState)
                .param("duplicateOfEventId", duplicateOfEventId)
                .param("operatorNote", normalized.operatorNote())
                .query()
                .singleRow();
            return ingestionRow(updated);
        }

        UUID duplicateOfEventId = findFingerprintDuplicate(normalized, fingerprint, null);
        String state = duplicateOfEventId == null ? "imported" : "duplicate";
        Map<String, Object> inserted = jdbc.sql(
                """
                INSERT INTO event_ingestions (
                  source_type, source_url, source_event_key, raw_payload, title, description,
                  starts_at, ends_at, venue_name, address, cover_image_url, external_url,
                  category, tags, price_info, fingerprint, state, duplicate_of_event_id, operator_note
                ) VALUES (
                  :sourceType, :sourceUrl, :sourceEventKey, CAST(:rawPayload AS jsonb), :title, :description,
                  :startsAt, :endsAt, :venueName, :address, :coverImageUrl, :externalUrl,
                  CAST(:category AS event_category), :tags, :priceInfo, :fingerprint, :state, :duplicateOfEventId, :operatorNote
                )
                RETURNING *
                """
            )
            .param("sourceType", normalized.sourceType())
            .param("sourceUrl", normalized.sourceUrl())
            .param("sourceEventKey", normalized.sourceEventKey())
            .param("rawPayload", writeJson(rawPayload))
            .param("title", normalized.title())
            .param("description", normalized.description())
            .param("startsAt", normalized.startsAt())
            .param("endsAt", normalized.endsAt())
            .param("venueName", normalized.venueName())
            .param("address", normalized.address())
            .param("coverImageUrl", normalized.coverImageUrl())
            .param("externalUrl", normalized.externalUrl())
            .param("category", normalized.category())
            .param("tags", sqlTextArray(normalized.tags()))
            .param("priceInfo", normalized.priceInfo())
            .param("fingerprint", fingerprint)
            .param("state", state)
            .param("duplicateOfEventId", duplicateOfEventId)
            .param("operatorNote", normalized.operatorNote())
            .query()
            .singleRow();
        return ingestionRow(inserted);
    }

    public List<Map<String, Object>> listIngestions(String state) {
        if (state != null && !state.isBlank() && !INGESTION_STATES.contains(state)) {
            throw new IllegalArgumentException("Unsupported state: " + state);
        }
        String where = state == null || state.isBlank() ? "" : "WHERE state = :state";
        var statement = jdbc.sql(
            """
            SELECT id, state, source_type, source_event_key, title, venue_name, starts_at,
                   linked_event_id, duplicate_of_event_id, updated_at
            FROM event_ingestions
            %s
            ORDER BY updated_at DESC, first_seen_at DESC
            """.formatted(where)
        );
        if (state != null && !state.isBlank()) {
            statement = statement.param("state", state);
        }
        return statement.query().listOfRows().stream().map(this::ingestionSummaryRow).toList();
    }

    public Map<String, Object> getIngestionById(UUID ingestionId) {
        return jdbc.sql("SELECT * FROM event_ingestions WHERE id = :id")
            .param("id", ingestionId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(this::ingestionRow)
            .orElseThrow(() -> notFound("Ingestion not found: " + ingestionId));
    }

    @Transactional
    public Map<String, Object> publishIngestion(UUID ingestionId, PublishOptions opts) {
        Map<String, Object> ingestion = jdbc.sql("SELECT * FROM event_ingestions WHERE id = :id FOR UPDATE")
            .param("id", ingestionId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(this::ingestionRow)
            .orElseThrow(() -> notFound("Ingestion not found: " + ingestionId));

        if ("duplicate".equals(ingestion.get("state")) && opts.forceLinkEventId() == null) {
            throw new IllegalArgumentException("Duplicate candidate requires --force-link-event-id");
        }

        Map<String, Object> existingEvent = existingEvent(ingestion, opts.forceLinkEventId());
        UUID venueId = existingEvent != null && opts.venueId() == null
            ? uuidOrNull(existingEvent.get("venue_id"))
            : resolveVenue(ingestion, opts.venueId());
        OffsetDateTime previousStartsAt = existingEvent == null ? null : offsetDateTimeOrNull(existingEvent.get("starts_at"));
        UUID eventId;
        if (existingEvent != null) {
            eventId = uuidOrNull(existingEvent.get("id"));
            jdbc.sql(
                    """
                    UPDATE events
                    SET venue_id = :venueId,
                        title = :title,
                        description = :description,
                        cover_image_url = :coverImageUrl,
                        starts_at = :startsAt,
                        ends_at = :endsAt,
                        category = CAST(:category AS event_category),
                        tags = :tags,
                        price_info = :priceInfo,
                        external_url = :externalUrl,
                        status = 'published',
                        source_type = :sourceType,
                        source_url = :sourceUrl,
                        source_event_key = :sourceEventKey,
                        source_fingerprint = :sourceFingerprint,
                        source_updated_at = now(),
                        last_ingested_at = now(),
                        updated_at = now(),
                        cancelled_at = NULL,
                        cancellation_reason = NULL
                    WHERE id = :eventId
                    """
                )
                .param("eventId", eventId)
                .param("venueId", venueId)
                .param("title", ingestion.get("title"))
                .param("description", ingestion.get("description"))
                .param("coverImageUrl", ingestion.get("cover_image_url"))
                .param("startsAt", ingestion.get("starts_at"))
                .param("endsAt", ingestion.get("ends_at"))
                .param("category", ingestion.get("category"))
                .param("tags", sqlTextArray(listOfStrings(ingestion.get("tags"))))
                .param("priceInfo", ingestion.get("price_info"))
                .param("externalUrl", ingestion.get("external_url"))
                .param("sourceType", ingestion.get("source_type"))
                .param("sourceUrl", ingestion.get("source_url"))
                .param("sourceEventKey", ingestion.get("source_event_key"))
                .param("sourceFingerprint", ingestion.get("fingerprint"))
                .update();
        } else {
            eventId = jdbc.sql(
                    """
                    INSERT INTO events (
                      venue_id, title, description, cover_image_url, starts_at, ends_at,
                      category, tags, price_info, external_url, status, source_type,
                      source_url, source_event_key, source_fingerprint, source_updated_at,
                      last_ingested_at, updated_at
                    ) VALUES (
                      :venueId, :title, :description, :coverImageUrl, :startsAt, :endsAt,
                      CAST(:category AS event_category), :tags, :priceInfo, :externalUrl, 'published', :sourceType,
                      :sourceUrl, :sourceEventKey, :sourceFingerprint, now(),
                      now(), now()
                    )
                    RETURNING id
                    """
                )
                .param("venueId", venueId)
                .param("title", ingestion.get("title"))
                .param("description", ingestion.get("description"))
                .param("coverImageUrl", ingestion.get("cover_image_url"))
                .param("startsAt", ingestion.get("starts_at"))
                .param("endsAt", ingestion.get("ends_at"))
                .param("category", ingestion.get("category"))
                .param("tags", sqlTextArray(listOfStrings(ingestion.get("tags"))))
                .param("priceInfo", ingestion.get("price_info"))
                .param("externalUrl", ingestion.get("external_url"))
                .param("sourceType", ingestion.get("source_type"))
                .param("sourceUrl", ingestion.get("source_url"))
                .param("sourceEventKey", ingestion.get("source_event_key"))
                .param("sourceFingerprint", ingestion.get("fingerprint"))
                .query(UUID.class)
                .single();
        }

        jdbc.sql(
                """
                UPDATE event_ingestions
                SET state = 'published',
                    linked_event_id = :eventId,
                    duplicate_of_event_id = NULL,
                    published_at = COALESCE(published_at, now()),
                    updated_at = now()
                WHERE id = :ingestionId
                """
            )
            .param("ingestionId", ingestionId)
            .param("eventId", eventId)
            .update();

        OffsetDateTime startsAt = offsetDateTimeOrNull(ingestion.get("starts_at"));
        if (previousStartsAt != null && startsAt != null && !previousStartsAt.isEqual(startsAt)) {
            emitTimeChangedNotifications(eventId, String.valueOf(ingestion.get("title")), previousStartsAt, startsAt);
        }

        return Map.of(
            "ingestion", getIngestionById(ingestionId),
            "eventId", eventId.toString(),
            "action", existingEvent == null ? "created" : "updated"
        );
    }

    @Transactional
    public Map<String, Object> updateFromIngestion(UUID ingestionId) {
        Map<String, Object> ingestion = getIngestionById(ingestionId);
        UUID linkedEventId = uuidOrNull(ingestion.get("linked_event_id"));
        if (linkedEventId != null) {
            return publishIngestion(ingestionId, PublishOptions.empty());
        }
        Object sourceEventKey = ingestion.get("source_event_key");
        if (sourceEventKey == null || sourceEventKey.toString().isBlank()) {
            throw new IllegalArgumentException("Update requires an ingestion linked to an event or a source_event_key");
        }
        UUID existingEventId = jdbc.sql(
                """
                SELECT id
                FROM events
                WHERE source_type = :sourceType AND source_event_key = :sourceEventKey
                LIMIT 1
                """
            )
            .param("sourceType", ingestion.get("source_type"))
            .param("sourceEventKey", sourceEventKey)
            .query(UUID.class)
            .list()
            .stream()
            .findFirst()
            .orElse(null);
        if (existingEventId == null) {
            throw new IllegalArgumentException("Event is not published yet; run ops:publish first");
        }
        return publishIngestion(ingestionId, PublishOptions.empty());
    }

    @Transactional
    public Map<String, Object> syncNormalizedEvent(Object rawPayload) {
        Map<String, Object> ingestion = importNormalizedEvent(rawPayload);
        try {
            return updateFromIngestion(uuidOrNull(ingestion.get("id")));
        } catch (IllegalArgumentException exception) {
            if (exception.getMessage() != null && exception.getMessage().contains("not published yet")) {
                return Map.of("ingestion", ingestion, "skipped", "not published yet; run ops:publish");
            }
            throw exception;
        }
    }

    @Transactional
    public Map<String, Object> cancelEventById(UUID eventId, String reason) {
        String cancellationReason = requireString(reason, "reason");
        Map<String, Object> event = jdbc.sql("SELECT id, title, status FROM events WHERE id = :eventId FOR UPDATE")
            .param("eventId", eventId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .orElseThrow(() -> notFound("Event not found: " + eventId));

        jdbc.sql(
                """
                UPDATE events
                SET status = 'cancelled',
                    cancelled_at = now(),
                    cancellation_reason = :reason,
                    updated_at = now(),
                    last_ingested_at = now()
                WHERE id = :eventId
                """
            )
            .param("eventId", eventId)
            .param("reason", cancellationReason)
            .update();
        jdbc.sql(
                """
                UPDATE event_ingestions
                SET state = 'cancelled',
                    linked_event_id = :eventId,
                    updated_at = now()
                WHERE linked_event_id = :eventId
                """
            )
            .param("eventId", eventId)
            .update();

        if (!"cancelled".equals(event.get("status"))) {
            emitCancelledNotifications(eventId, String.valueOf(event.get("title")), cancellationReason);
        }
        return Map.of("eventId", eventId.toString(), "status", "cancelled");
    }

    private Map<String, Object> existingEvent(Map<String, Object> ingestion, UUID forceLinkEventId) {
        if (forceLinkEventId != null) {
            Map<String, Object> event = eventRowById(forceLinkEventId);
            if (event == null) {
                throw notFound("Event not found: " + forceLinkEventId);
            }
            return event;
        }
        UUID linkedEventId = uuidOrNull(ingestion.get("linked_event_id"));
        if (linkedEventId != null) {
            return eventRowById(linkedEventId);
        }
        Object sourceEventKey = ingestion.get("source_event_key");
        if (sourceEventKey != null && !sourceEventKey.toString().isBlank()) {
            return jdbc.sql(
                    """
                    SELECT id, venue_id, title, starts_at, status
                    FROM events
                    WHERE source_type = :sourceType AND source_event_key = :sourceEventKey
                    """
                )
                .param("sourceType", ingestion.get("source_type"))
                .param("sourceEventKey", sourceEventKey)
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .map(SqlRows::normalize)
                .orElse(null);
        }
        return null;
    }

    private Map<String, Object> eventRowById(UUID eventId) {
        return jdbc.sql("SELECT id, venue_id, title, starts_at, status FROM events WHERE id = :eventId")
            .param("eventId", eventId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElse(null);
    }

    private UUID resolveVenue(Map<String, Object> ingestion, UUID venueId) {
        if (venueId != null) {
            Integer count = jdbc.sql("SELECT COUNT(*) FROM venues WHERE id = :venueId")
                .param("venueId", venueId)
                .query(Integer.class)
                .single();
            if (count == 0) {
                throw notFound("Venue not found: " + venueId);
            }
            return venueId;
        }
        UUID existingVenue = jdbc.sql(
                """
                SELECT id
                FROM venues
                WHERE lower(name) = lower(:name) AND lower(address) = lower(:address)
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
            .param("name", ingestion.get("venue_name"))
            .param("address", ingestion.get("address"))
            .query(UUID.class)
            .list()
            .stream()
            .findFirst()
            .orElse(null);
        if (existingVenue != null) {
            return existingVenue;
        }
        return jdbc.sql(
                """
                INSERT INTO venues (name, description, address, lat, lng, cover_image_url)
                VALUES (:name, '', :address, 0, 0, :coverImageUrl)
                RETURNING id
                """
            )
            .param("name", ingestion.get("venue_name"))
            .param("address", ingestion.get("address"))
            .param("coverImageUrl", ingestion.get("cover_image_url"))
            .query(UUID.class)
            .single();
    }

    private void emitTimeChangedNotifications(
        UUID eventId,
        String eventTitle,
        OffsetDateTime oldStartsAt,
        OffsetDateTime newStartsAt
    ) {
        for (UUID userId : linkedParticipantIds(eventId)) {
            notificationService.create(userId, "event_time_changed", Map.of(
                "event_id", eventId.toString(),
                "event_title", eventTitle,
                "old_starts_at", oldStartsAt.toString(),
                "new_starts_at", newStartsAt.toString()
            ));
        }
    }

    private void emitCancelledNotifications(UUID eventId, String eventTitle, String reason) {
        for (UUID userId : linkedParticipantIds(eventId)) {
            notificationService.create(userId, "event_cancelled", Map.of(
                "event_id", eventId.toString(),
                "event_title", eventTitle,
                "cancellation_reason", reason
            ));
        }
    }

    private List<UUID> linkedParticipantIds(UUID eventId) {
        return jdbc.sql(
                """
                SELECT DISTINCT pp.user_id
                FROM plans p
                JOIN plan_participants pp ON pp.plan_id = p.id
                WHERE p.linked_event_id = :eventId
                """
            )
            .param("eventId", eventId)
            .query(UUID.class)
            .list();
    }

    private UUID findFingerprintDuplicate(NormalizedEventInput input, String fingerprint, UUID ignoreEventId) {
        String sourceWhere = ignoreEventId == null ? "" : "AND id <> :ignoreEventId";
        var sourceStatement = jdbc.sql(
                """
                SELECT id
                FROM events
                WHERE source_fingerprint = :fingerprint
                %s
                ORDER BY created_at DESC
                LIMIT 1
                """.formatted(sourceWhere)
            )
            .param("fingerprint", fingerprint);
        if (ignoreEventId != null) {
            sourceStatement = sourceStatement.param("ignoreEventId", ignoreEventId);
        }
        UUID sourceEventId = sourceStatement.query(UUID.class).list().stream().findFirst().orElse(null);
        if (sourceEventId != null) {
            return sourceEventId;
        }

        String fallbackWhere = ignoreEventId == null ? "" : "AND e.id <> :ignoreEventId";
        var fallbackStatement = jdbc.sql(
                """
                SELECT e.id
                FROM events e
                JOIN venues v ON v.id = e.venue_id
                WHERE lower(regexp_replace(trim(e.title), '[[:space:]]+', ' ', 'g')) = :title
                  AND lower(regexp_replace(trim(v.name), '[[:space:]]+', ' ', 'g')) = :venueName
                  AND lower(regexp_replace(trim(v.address), '[[:space:]]+', ' ', 'g')) = :address
                  AND e.starts_at = :startsAt
                  %s
                ORDER BY e.created_at DESC
                LIMIT 1
                """.formatted(fallbackWhere)
            )
            .param("title", normalizeText(input.title()))
            .param("venueName", normalizeText(input.venueName()))
            .param("address", normalizeText(input.address()))
            .param("startsAt", input.startsAt());
        if (ignoreEventId != null) {
            fallbackStatement = fallbackStatement.param("ignoreEventId", ignoreEventId);
        }
        return fallbackStatement.query(UUID.class).list().stream().findFirst().orElse(null);
    }

    private NormalizedEventInput normalizeInput(Object payload) {
        JsonNode input = objectMapper.valueToTree(payload);
        if (!input.isObject()) {
            throw new IllegalArgumentException("Normalized event payload must be a JSON object");
        }
        OffsetDateTime startsAt = parseIso(requireString(input.get("starts_at"), "starts_at"), "starts_at");
        OffsetDateTime endsAt = parseIso(requireString(input.get("ends_at"), "ends_at"), "ends_at");
        if (!endsAt.isAfter(startsAt)) {
            throw new IllegalArgumentException("ends_at must be later than starts_at");
        }
        return new NormalizedEventInput(
            requireString(input.get("source_type"), "source_type"),
            optionalString(input.get("source_url")),
            optionalString(input.get("source_event_key")),
            requireString(input.get("title"), "title"),
            optionalString(input.get("description"), ""),
            startsAt,
            endsAt,
            requireString(input.get("venue_name"), "venue_name"),
            requireString(input.get("address"), "address"),
            requireString(input.get("cover_image_url"), "cover_image_url"),
            optionalString(input.get("external_url")),
            normalizeCategory(input.get("category")),
            parseTags(input.get("tags")),
            optionalString(input.get("price_info")),
            optionalString(input.get("operator_note"))
        );
    }

    private Map<String, Object> ingestionRow(Map<String, Object> row) {
        Map<String, Object> normalized = SqlRows.normalize(row);
        Object rawPayload = normalized.get("raw_payload");
        if (rawPayload instanceof String json) {
            normalized.put("raw_payload", readJsonObject(json));
        }
        return normalized;
    }

    private Map<String, Object> ingestionSummaryRow(Map<String, Object> row) {
        return SqlRows.normalize(row);
    }

    private Object readJsonObject(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to parse raw_payload", exception);
        }
    }

    private String writeJson(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Normalized event payload must be JSON serializable", exception);
        }
    }

    private String[] sqlTextArray(List<String> values) {
        return values.toArray(String[]::new);
    }

    private String buildFingerprint(NormalizedEventInput input) {
        String startsAt = input.startsAt().toInstant().toString().substring(0, 16);
        return String.join(
            "|",
            normalizeText(input.title()),
            normalizeText(input.venueName()),
            normalizeText(input.address()),
            startsAt
        );
    }

    private String normalizeText(String value) {
        return value.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private String requireString(JsonNode value, String field) {
        if (value == null || !value.isTextual() || value.asText().trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value.asText().trim();
    }

    private String requireString(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value.trim();
    }

    private String optionalString(JsonNode value) {
        return optionalString(value, null);
    }

    private String optionalString(JsonNode value, String fallback) {
        if (value == null || !value.isTextual()) {
            return fallback;
        }
        String trimmed = value.asText().trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }

    private OffsetDateTime parseIso(String value, String field) {
        try {
            return Instant.parse(value).atOffset(ZoneOffset.UTC);
        } catch (Exception exception) {
            try {
                return OffsetDateTime.parse(value).withOffsetSameInstant(ZoneOffset.UTC);
            } catch (Exception ignored) {
                throw new IllegalArgumentException(field + " must be a valid ISO date");
            }
        }
    }

    private List<String> parseTags(JsonNode value) {
        if (value == null || value.isNull()) {
            return List.of();
        }
        if (!value.isArray()) {
            throw new IllegalArgumentException("tags must be an array of strings");
        }
        List<String> tags = new java.util.ArrayList<>();
        for (int i = 0; i < value.size(); i++) {
            JsonNode tag = value.get(i);
            if (!tag.isTextual() || tag.asText().trim().isEmpty()) {
                throw new IllegalArgumentException("tags[" + i + "] must be a non-empty string");
            }
            tags.add(tag.asText().trim());
        }
        return List.copyOf(tags);
    }

    private String normalizeCategory(JsonNode value) {
        if (value == null || value.isNull()) {
            return "other";
        }
        if (!value.isTextual()) {
            throw new IllegalArgumentException("category must be a string");
        }
        String category = value.asText().trim();
        if (!EVENT_CATEGORIES.contains(category)) {
            throw new IllegalArgumentException("Unsupported category: " + category);
        }
        return category;
    }

    @SuppressWarnings("unchecked")
    private List<String> listOfStrings(Object value) {
        if (value == null) {
            return List.of();
        }
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return (List<String>) value;
    }

    private UUID uuidOrNull(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof UUID uuid) {
            return uuid;
        }
        return UUID.fromString(value.toString());
    }

    private OffsetDateTime offsetDateTimeOrNull(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof OffsetDateTime offsetDateTime) {
            return offsetDateTime;
        }
        if (value instanceof java.sql.Timestamp timestamp) {
            return OffsetDateTime.ofInstant(timestamp.toInstant(), ZoneOffset.UTC);
        }
        return OffsetDateTime.parse(value.toString());
    }

    private ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, "ERROR", message);
    }

    private record NormalizedEventInput(
        String sourceType,
        String sourceUrl,
        String sourceEventKey,
        String title,
        String description,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt,
        String venueName,
        String address,
        String coverImageUrl,
        String externalUrl,
        String category,
        List<String> tags,
        String priceInfo,
        String operatorNote
    ) {
    }

    public record PublishOptions(UUID venueId, UUID forceLinkEventId) {
        public static PublishOptions empty() {
            return new PublishOptions(null, null);
        }
    }
}
