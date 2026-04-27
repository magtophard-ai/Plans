package com.plans.backend.api.smoke;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plans.backend.content.ContentOpsService;
import com.plans.backend.content.ContentOpsService.PublishOptions;
import com.plans.backend.persistence.DevSeedRunner;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(properties = {
    "JWT_SECRET=dev-secret",
    "OTP_CODE=1111",
})
@AutoConfigureMockMvc
@Testcontainers
class SpringContentOpsSmokeIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17");

    private static final ObjectMapper JSON = new ObjectMapper();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("DATABASE_URL", POSTGRES::getJdbcUrl);
        registry.add("DATABASE_USERNAME", POSTGRES::getUsername);
        registry.add("DATABASE_PASSWORD", POSTGRES::getPassword);
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ContentOpsService contentOpsService;

    @Autowired
    private DevSeedRunner devSeedRunner;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        devSeedRunner.run();
    }

    @Test
    void springContentOpsSmokeCoversImportSyncPublishDuplicatesVenuesCancelAndErrors() throws Exception {
        Login userA = login("+79990000000");
        Login userB = login("+79991111111");
        String seed = String.valueOf(System.currentTimeMillis());

        Map<String, Object> original = eventPayload(seed, "2030-05-01T18:00:00.000Z", "ops-" + seed);
        Map<String, Object> ingestion = contentOpsService.importNormalizedEvent(original);
        assertThat(ingestion.get("state")).isEqualTo("imported");
        assertThat(ingestion.get("raw_payload")).isInstanceOf(Map.class);

        List<Map<String, Object>> imported = contentOpsService.listIngestions("imported");
        assertThat(imported).anySatisfy(row -> assertThat(row.get("id")).isEqualTo(ingestion.get("id")));
        assertThat(contentOpsService.getIngestionById(uuid(ingestion.get("id"))).get("title")).isEqualTo(original.get("title"));

        mockMvc.perform(get("/api/events").header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events[?(@.title == '%s')]", original.get("title")).value(hasSize(0)));

        Map<String, Object> edited = new LinkedHashMap<>(original);
        edited.put("description", "Updated staged description");
        edited.put("operator_note", "edited before publish");
        Map<String, Object> editedIngestion = contentOpsService.importNormalizedEvent(edited);
        assertThat(editedIngestion.get("id")).isEqualTo(ingestion.get("id"));
        assertThat(editedIngestion.get("description")).isEqualTo("Updated staged description");
        assertThat(editedIngestion.get("operator_note")).isEqualTo("edited before publish");

        Map<String, Object> syncOnly = eventPayload(
            seed + "-sync-only",
            "2030-05-03T18:00:00.000Z",
            "ops-" + seed + "-sync-only"
        );
        Map<String, Object> syncResult = contentOpsService.syncNormalizedEvent(syncOnly);
        assertThat(syncResult.get("skipped")).isEqualTo("not published yet; run ops:publish");
        assertEventCount(syncOnly, 0);

        Map<String, Object> published = contentOpsService.publishIngestion(uuid(ingestion.get("id")), PublishOptions.empty());
        String eventId = String.valueOf(published.get("eventId"));
        assertThat(published.get("action")).isEqualTo("created");
        mockMvc.perform(get("/api/events/" + eventId).header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.event.id").value(eventId))
            .andExpect(jsonPath("$.event.status").value("published"))
            .andExpect(jsonPath("$.event.venue.lat").value(0.0))
            .andExpect(jsonPath("$.event.venue.lng").value(0.0));
        mockMvc.perform(get("/api/events").header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events[?(@.id == '%s')]", eventId).value(not(hasSize(0))));
        mockMvc.perform(get("/api/search/events?q=" + original.get("title")).header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events[?(@.id == '%s')]", eventId).value(not(hasSize(0))));

        String venueId = jdbc.queryForObject("SELECT venue_id::text FROM events WHERE id = ?::uuid", String.class, eventId);
        mockMvc.perform(get("/api/venues/" + venueId + "/events").header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events[?(@.id == '%s')]", eventId).value(not(hasSize(0))));
        Integer autoCreatedVenues = jdbc.queryForObject(
            "SELECT COUNT(*) FROM venues WHERE name = ? AND address = ?",
            Integer.class,
            original.get("venue_name"),
            original.get("address")
        );
        assertThat(autoCreatedVenues).isEqualTo(1);

        contentOpsService.importNormalizedEvent(original);
        contentOpsService.updateFromIngestion(uuid(ingestion.get("id")));
        assertEventCount(original, 1);
        assertThat(contentOpsService.publishIngestion(uuid(ingestion.get("id")), PublishOptions.empty()).get("action")).isEqualTo("updated");
        assertEventCount(original, 1);
        Integer venueCountAfterRepeat = jdbc.queryForObject(
            "SELECT COUNT(*) FROM venues WHERE name = ? AND address = ?",
            Integer.class,
            original.get("venue_name"),
            original.get("address")
        );
        assertThat(venueCountAfterRepeat).isEqualTo(1);

        Map<String, Object> fingerprintDuplicatePayload = new LinkedHashMap<>(original);
        fingerprintDuplicatePayload.remove("source_event_key");
        Map<String, Object> fingerprintDuplicate = contentOpsService.importNormalizedEvent(fingerprintDuplicatePayload);
        assertThat(fingerprintDuplicate.get("state")).isEqualTo("duplicate");
        assertThat(fingerprintDuplicate.get("duplicate_of_event_id")).isEqualTo(eventId);
        org.junit.jupiter.api.Assertions.assertThrows(
            IllegalArgumentException.class,
            () -> contentOpsService.publishIngestion(uuid(fingerprintDuplicate.get("id")), PublishOptions.empty())
        );

        UUID legacyVenueId = jdbc.queryForObject(
            """
            INSERT INTO venues (name, address, lat, lng, cover_image_url)
            VALUES (?, ?, 55.75, 37.61, ?)
            RETURNING id
            """,
            UUID.class,
            "Legacy Venue " + seed,
            "Legacy Street " + seed,
            "https://placehold.co/600x400"
        );
        String legacyStartsAt = "2030-05-04T18:00:00.000Z";
        UUID legacyEventId = jdbc.queryForObject(
            """
            INSERT INTO events (
              venue_id, title, description, cover_image_url, starts_at, ends_at, category, tags, source_fingerprint
            ) VALUES (
              ?, ?, ?, ?, ?::timestamptz, ?::timestamptz, 'music', ARRAY['legacy'], NULL
            )
            RETURNING id
            """,
            UUID.class,
            legacyVenueId,
            "Legacy Duplicate " + seed,
            "Legacy seeded event without source fingerprint",
            "https://placehold.co/600x400",
            legacyStartsAt,
            "2030-05-04T20:00:00.000Z"
        );
        Map<String, Object> legacyDuplicatePayload = new LinkedHashMap<>();
        legacyDuplicatePayload.put("source_type", "manual");
        legacyDuplicatePayload.put("title", "Legacy Duplicate " + seed);
        legacyDuplicatePayload.put("description", "Normalized duplicate of legacy event");
        legacyDuplicatePayload.put("starts_at", legacyStartsAt);
        legacyDuplicatePayload.put("ends_at", "2030-05-04T20:00:00.000Z");
        legacyDuplicatePayload.put("venue_name", "Legacy Venue " + seed);
        legacyDuplicatePayload.put("address", "Legacy Street " + seed);
        legacyDuplicatePayload.put("cover_image_url", "https://placehold.co/600x400");
        legacyDuplicatePayload.put("category", "music");
        legacyDuplicatePayload.put("tags", List.of("legacy"));
        Map<String, Object> legacyDuplicate = contentOpsService.importNormalizedEvent(legacyDuplicatePayload);
        assertThat(legacyDuplicate.get("state")).isEqualTo("duplicate");
        assertThat(legacyDuplicate.get("duplicate_of_event_id")).isEqualTo(legacyEventId.toString());
        org.junit.jupiter.api.Assertions.assertThrows(
            IllegalArgumentException.class,
            () -> contentOpsService.publishIngestion(uuid(legacyDuplicate.get("id")), PublishOptions.empty())
        );

        String linkedPlanId = createLinkedPlan(userA.token(), eventId, userB.userId(), original.get("title").toString());
        Map<String, Object> changed = eventPayload(seed, "2030-05-01T20:00:00.000Z", "ops-" + seed);
        Map<String, Object> changedIngestion = contentOpsService.importNormalizedEvent(changed);
        Map<String, Object> updated = contentOpsService.updateFromIngestion(uuid(changedIngestion.get("id")));
        assertThat(updated.get("eventId")).isEqualTo(eventId);
        assertThat(updated.get("action")).isEqualTo("updated");
        mockMvc.perform(get("/api/events/" + eventId).header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.event.starts_at").value(Instant.parse(changed.get("starts_at").toString()).toString()));
        mockMvc.perform(get("/api/notifications").header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.notifications[?(@.type == 'event_time_changed' && @.payload.event_id == '%s')]", eventId).value(not(hasSize(0))));
        assertThat(linkedPlanId).isNotBlank();

        contentOpsService.cancelEventById(uuid(eventId), "Отменено организатором");
        mockMvc.perform(get("/api/events/" + eventId).header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.event.id").value(eventId))
            .andExpect(jsonPath("$.event.status").value("cancelled"));
        mockMvc.perform(get("/api/events").header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events[?(@.id == '%s')]", eventId).value(hasSize(0)));
        mockMvc.perform(get("/api/search/events?q=" + original.get("title")).header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events[?(@.id == '%s')]", eventId).value(hasSize(0)));
        mockMvc.perform(get("/api/venues/" + venueId + "/events").header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events[?(@.id == '%s')]", eventId).value(hasSize(0)));
        mockMvc.perform(get("/api/notifications").header("Authorization", bearer(userA.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.notifications[?(@.type == 'event_cancelled' && @.payload.event_id == '%s')]", eventId).value(not(hasSize(0))));

        org.junit.jupiter.api.Assertions.assertThrows(
            IllegalArgumentException.class,
            () -> contentOpsService.importNormalizedEvent(Map.of("source_type", "manual"))
        );
        org.junit.jupiter.api.Assertions.assertThrows(
            RuntimeException.class,
            () -> contentOpsService.getIngestionById(UUID.randomUUID())
        );
        mockMvc.perform(get("/api/events"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
            .andExpect(jsonPath("$.message").value("Unauthorized"));
        mockMvc.perform(get("/api/events/" + UUID.randomUUID()).header("Authorization", bearer(userA.token())))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Event not found"));
        mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(userA.token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
            .andExpect(jsonPath("$.message", notNullValue()));
    }

    private Login login(String phone) throws Exception {
        mockMvc.perform(post("/api/auth/otp/send")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\"}"))
            .andExpect(status().isOk());
        String verifyJson = mockMvc.perform(post("/api/auth/otp/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\",\"code\":\"1111\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode response = JSON.readTree(verifyJson);
        return new Login(response.at("/access_token").asText(), response.at("/user/id").asText());
    }

    private String createLinkedPlan(String token, String eventId, String participantId, String title) throws Exception {
        String response = mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "title":"Plan for %s",
                      "activity_type":"other",
                      "linked_event_id":"%s",
                      "participant_ids":["%s"]
                    }
                    """.formatted(title, eventId, participantId)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.plan.id", notNullValue()))
            .andReturn()
            .getResponse()
            .getContentAsString();
        return JSON.readTree(response).at("/plan/id").asText();
    }

    private Map<String, Object> eventPayload(String seed, String startsAt, String sourceEventKey) {
        Instant starts = Instant.parse(startsAt);
        return Map.ofEntries(
            Map.entry("source_type", "manual"),
            Map.entry("source_url", "https://example.test/events/" + seed),
            Map.entry("source_event_key", sourceEventKey),
            Map.entry("title", "Content Ops Smoke " + seed),
            Map.entry("description", "Нормализованное тестовое событие"),
            Map.entry("starts_at", starts.toString()),
            Map.entry("ends_at", starts.plusSeconds(2 * 60 * 60).toString()),
            Map.entry("venue_name", "Ops Venue " + seed),
            Map.entry("address", "Ops Street " + seed),
            Map.entry("cover_image_url", "https://placehold.co/600x400/00B894/white?text=Ops"),
            Map.entry("external_url", "https://tickets.example.test/" + seed),
            Map.entry("category", "music"),
            Map.entry("tags", List.of("ops", "smoke")),
            Map.entry("price_info", "100 ₽")
        );
    }

    private void assertEventCount(Map<String, Object> payload, int expected) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM events WHERE source_type = ? AND source_event_key = ?",
            Integer.class,
            payload.get("source_type"),
            payload.get("source_event_key")
        );
        assertThat(count).isEqualTo(expected);
    }

    private UUID uuid(Object value) {
        return UUID.fromString(value.toString());
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private record Login(String token, String userId) {
    }
}
