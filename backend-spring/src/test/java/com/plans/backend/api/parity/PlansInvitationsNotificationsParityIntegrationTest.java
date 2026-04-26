package com.plans.backend.api.parity;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plans.backend.persistence.DevSeedRunner;
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
class PlansInvitationsNotificationsParityIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17");

    private static final ObjectMapper MAPPER = new ObjectMapper();

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
    private DevSeedRunner devSeedRunner;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        devSeedRunner.run();
    }

    @Test
    void listPlansAndPlanDetailMatchFastifyWrappers() throws Exception {
        String token = login("+79990000000");

        mockMvc.perform(get("/api/plans?participant=me").header("Authorization", bearer(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plans", hasSize(greaterThanOrEqualTo(3))))
            .andExpect(jsonPath("$.plans[0].participants", notNullValue()))
            .andExpect(jsonPath("$.plans[0].proposals", notNullValue()))
            .andExpect(jsonPath("$.total").value(greaterThanOrEqualTo(3)));

        mockMvc.perform(get("/api/plans/71111111-1111-4111-8111-111111111111")
                .header("Authorization", bearer(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.title").value("Джазовый вечер"))
            .andExpect(jsonPath("$.plan.linked_event.title").value("Джазовый вечер"))
            .andExpect(jsonPath("$.plan.participants", hasSize(greaterThanOrEqualTo(3))));
    }

    @Test
    void createGenericPlanIsAtomicAndCreatesInvitationsAndNotifications() throws Exception {
        String token = login("+79990000000");
        String inviteeId = userId("+79991111111");

        String response = mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "title":"Новый план",
                      "activity_type":"coffee",
                      "confirmed_place_text":"Кафе",
                      "participant_ids":["%s"]
                    }
                    """.formatted(inviteeId)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.plan.title").value("Новый план"))
            .andExpect(jsonPath("$.plan.activity_type").value("coffee"))
            .andExpect(jsonPath("$.plan.place_status").value("confirmed"))
            .andExpect(jsonPath("$.plan.time_status").value("undecided"))
            .andExpect(jsonPath("$.plan.participants", hasSize(2)))
            .andReturn()
            .getResponse()
            .getContentAsString();

        String planId = read(response, "/plan/id").asText();
        expectCount("SELECT COUNT(*) FROM invitations WHERE type = 'plan' AND target_id = ?::uuid", planId, 1);
        expectCount("SELECT COUNT(*) FROM notifications WHERE user_id = ?::uuid AND type = 'plan_invite'", inviteeId, 1);
    }

    @Test
    void createEventLinkedPlanReturnsLinkedEvent() throws Exception {
        String token = login("+79990000000");

        mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "title":"Событийный план",
                      "activity_type":"exhibition",
                      "linked_event_id":"61111111-1111-4111-8111-111111111111",
                      "confirmed_time":"2026-05-01T12:00:00+03:00"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.plan.linked_event.id").value("61111111-1111-4111-8111-111111111111"))
            .andExpect(jsonPath("$.plan.time_status").value("confirmed"));
    }

    @Test
    void participantStatusUpdateAndCreatorRemoveMatchFastifyBehavior() throws Exception {
        String creatorToken = login("+79990000000");
        String friendId = userId("+79992222222");

        mockMvc.perform(patch("/api/plans/71111111-1111-4111-8111-111111111111/participants/" + friendId)
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"cant\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.participant.status").value("cant"));

        mockMvc.perform(delete("/api/plans/71111111-1111-4111-8111-111111111111/participants/" + friendId)
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isNoContent());

        expectCount(
            "SELECT COUNT(*) FROM plan_participants WHERE plan_id = '71111111-1111-4111-8111-111111111111'::uuid AND user_id = ?::uuid",
            friendId,
            0
        );
    }

    @Test
    void inviteParticipantCreatesParticipantInvitationAndNotification() throws Exception {
        String creatorToken = login("+79990000000");
        String inviteeId = userId("+79991111111");
        String response = mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Invite later\",\"activity_type\":\"coffee\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        String planId = read(response, "/plan/id").asText();

        mockMvc.perform(post("/api/plans/" + planId + "/participants")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"user_id\":\"" + inviteeId + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.participant.plan_id").value(planId))
            .andExpect(jsonPath("$.participant.user_id").value(inviteeId))
            .andExpect(jsonPath("$.participant.status").value("invited"))
            .andExpect(jsonPath("$.participant.user.username").value("masha"));

        expectCount(
            "SELECT COUNT(*) FROM invitations WHERE type = 'plan' AND target_id = ?::uuid AND invitee_id = ?::uuid AND status = 'pending'",
            planId,
            inviteeId,
            1
        );
        expectCount(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ?::uuid AND type = 'plan_invite' AND payload->>'plan_id' = ?",
            inviteeId,
            planId,
            1
        );
        String inviterName = jdbc.queryForObject(
            "SELECT payload->>'inviter_name' FROM notifications WHERE user_id = ?::uuid AND payload->>'plan_id' = ? ORDER BY created_at DESC LIMIT 1",
            String.class,
            inviteeId,
            planId
        );
        org.assertj.core.api.Assertions.assertThat(inviterName).isEqualTo("Я");
    }

    @Test
    void inviteParticipantRejectsNonCreatorInactiveAlreadyParticipantMissingUserAndFullPlan() throws Exception {
        String creatorToken = login("+79990000000");
        String nonCreatorToken = login("+79991111111");
        String dimaId = userId("+79992222222");
        String lenaId = userId("+79993333333");
        String katyaId = userId("+79995555555");

        mockMvc.perform(post("/api/plans/71111111-1111-4111-8111-111111111111/participants")
                .header("Authorization", bearer(nonCreatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"user_id\":\"" + katyaId + "\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("FORBIDDEN"))
            .andExpect(jsonPath("$.message").value("Only creator can invite"));

        mockMvc.perform(post("/api/plans/73333333-3333-4333-8333-333333333333/participants")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"user_id\":\"" + dimaId + "\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"))
            .andExpect(jsonPath("$.message").value("Can only invite in active plans"));

        mockMvc.perform(post("/api/plans/71111111-1111-4111-8111-111111111111/participants")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"user_id\":\"" + dimaId + "\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ALREADY_PARTICIPANT"))
            .andExpect(jsonPath("$.message").value("User is already a participant"));

        mockMvc.perform(post("/api/plans/71111111-1111-4111-8111-111111111111/participants")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
            .andExpect(jsonPath("$.message").value("user_id required"));

        String fullPlan = mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Full invite plan\",\"participant_ids\":" + participantIds(14, 100) + "}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        String fullPlanId = read(fullPlan, "/plan/id").asText();
        String extraUserId = userIdAfterLogin("+79879999999");

        mockMvc.perform(post("/api/plans/" + fullPlanId + "/participants")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"user_id\":\"" + extraUserId + "\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PLAN_FULL"))
            .andExpect(jsonPath("$.message").value("Plan has max 15 participants"));
    }

    @Test
    void nonCreatorRemoveIsForbidden() throws Exception {
        String nonCreatorToken = login("+79991111111");
        String friendId = userId("+79992222222");

        mockMvc.perform(delete("/api/plans/71111111-1111-4111-8111-111111111111/participants/" + friendId)
                .header("Authorization", bearer(nonCreatorToken)))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("FORBIDDEN"))
            .andExpect(jsonPath("$.message").value("Cannot remove this participant"));
    }

    @Test
    void cancelAndCompleteLifecycleValidationMatchesFastify() throws Exception {
        String token = login("+79990000000");

        mockMvc.perform(post("/api/plans/71111111-1111-4111-8111-111111111111/cancel")
                .header("Authorization", bearer(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.lifecycle_state").value("cancelled"));

        mockMvc.perform(post("/api/plans/71111111-1111-4111-8111-111111111111/cancel")
                .header("Authorization", bearer(token)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"))
            .andExpect(jsonPath("$.message").value("Can only cancel active or finalized plans"));

        mockMvc.perform(post("/api/plans/72222222-2222-4222-8222-222222222222/complete")
                .header("Authorization", bearer(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.lifecycle_state").value("completed"));

        mockMvc.perform(post("/api/plans/73333333-3333-4333-8333-333333333333/complete")
                .header("Authorization", bearer(token)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"))
            .andExpect(jsonPath("$.message").value("Can only complete finalized or active plans"));
    }

    @Test
    void invitationsListAcceptAndDeclineMatchFastifyBehavior() throws Exception {
        String token = login("+79990000000");
        String invitationId = jdbc.queryForObject(
            "SELECT id::text FROM invitations WHERE invitee_id = ?::uuid AND type = 'plan' LIMIT 1",
            String.class,
            userId("+79990000000")
        );

        mockMvc.perform(get("/api/invitations").header("Authorization", bearer(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.invitations", hasSize(greaterThanOrEqualTo(1))))
            .andExpect(jsonPath("$.invitations[0].plan.title").value("Джазовый вечер"));

        mockMvc.perform(patch("/api/invitations/" + invitationId)
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"accepted\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.invitation.status").value("accepted"))
            .andExpect(jsonPath("$.invitation.plan.id").value("71111111-1111-4111-8111-111111111111"));

        String declinedId = createInvitation("+79990000000");
        mockMvc.perform(patch("/api/invitations/" + declinedId)
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"declined\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.invitation.status").value("declined"))
            .andExpect(jsonPath("$.invitation.plan").doesNotExist())
            .andExpect(jsonPath("$.invitation.group").doesNotExist());
    }

    @Test
    void notificationsListReadAndReadAllMatchFastifyWrappers() throws Exception {
        String token = login("+79990000000");
        String userId = userId("+79990000000");
        String notificationId = jdbc.queryForObject(
            "SELECT id::text FROM notifications WHERE user_id = ?::uuid ORDER BY created_at DESC LIMIT 1",
            String.class,
            userId
        );

        mockMvc.perform(get("/api/notifications").header("Authorization", bearer(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.notifications", hasSize(greaterThanOrEqualTo(2))))
            .andExpect(jsonPath("$.notifications[0].payload", notNullValue()))
            .andExpect(jsonPath("$.unread_count").value(greaterThanOrEqualTo(2)));

        mockMvc.perform(patch("/api/notifications/" + notificationId + "/read")
                .header("Authorization", bearer(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.notification.read").value(true));

        mockMvc.perform(patch("/api/notifications/read-all").header("Authorization", bearer(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));

        expectCount("SELECT COUNT(*) FROM notifications WHERE user_id = ?::uuid AND read = false", userId, 0);
    }

    @Test
    void unauthorizedNotFoundAndErrorEnvelopesMatchFastify() throws Exception {
        String token = login("+79990000000");

        mockMvc.perform(get("/api/plans"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
            .andExpect(jsonPath("$.message").value("Unauthorized"));

        mockMvc.perform(get("/api/plans/" + UUID.randomUUID()).header("Authorization", bearer(token)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Plan not found"));

        mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
            .andExpect(jsonPath("$.message").value("title required"));

        mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"full\",\"participant_ids\":" + manyParticipantIds() + "}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PLAN_FULL"))
            .andExpect(jsonPath("$.message").value("Max 15 participants including creator"));
    }

    private String login(String phone) throws Exception {
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
        return read(verifyJson, "/access_token").asText();
    }

    private String userId(String phone) {
        return jdbc.queryForObject("SELECT id::text FROM users WHERE phone = ?", String.class, phone);
    }

    private String createInvitation(String inviteePhone) {
        String id = UUID.randomUUID().toString();
        jdbc.update(
            """
            INSERT INTO invitations (id, type, target_id, inviter_id, invitee_id, status)
            VALUES (?::uuid, 'plan', '72222222-2222-4222-8222-222222222222'::uuid,
                    ?::uuid, ?::uuid, 'pending')
            """,
            id,
            userId("+79992222222"),
            userId(inviteePhone)
        );
        return id;
    }

    private String manyParticipantIds() throws Exception {
        return participantIds(15, 0);
    }

    private String participantIds(int count, int offset) throws Exception {
        StringBuilder ids = new StringBuilder("[");
        for (int index = 0; index < count; index++) {
            String phone = "+7987%07d".formatted(index + offset);
            if (index > 0) {
                ids.append(',');
            }
            ids.append('"').append(userIdAfterLogin(phone)).append('"');
        }
        ids.append(']');
        return ids.toString();
    }

    private String userIdAfterLogin(String phone) throws Exception {
        login(phone);
        return userId(phone);
    }

    private void expectCount(String sql, String id, int expected) {
        Integer count = jdbc.queryForObject(sql, Integer.class, id);
        org.assertj.core.api.Assertions.assertThat(count).isEqualTo(expected);
    }

    private void expectCount(String sql, String firstId, String secondId, int expected) {
        Integer count = jdbc.queryForObject(sql, Integer.class, firstId, secondId);
        org.assertj.core.api.Assertions.assertThat(count).isEqualTo(expected);
    }

    private JsonNode read(String json, String pointer) throws Exception {
        return MAPPER.readTree(json).at(pointer);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
