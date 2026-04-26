package com.plans.backend.api.smoke;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
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
class SpringCoreSmokeIntegrationTest {
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
    private DevSeedRunner devSeedRunner;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        devSeedRunner.run();
    }

    @Test
    void springRestCoreSmokeCoversPlansLifecycleMessagesAndNotifications() throws Exception {
        mockMvc.perform(get("/api/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("ok"));

        Login creator = login("+79990000000");
        Login participant = login("+79991111111");
        Login joiner = login("+79994444444");
        String invitedUserId = userId("+79992222222");

        mockMvc.perform(get("/api/events").header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events", hasSize(greaterThanOrEqualTo(1))))
            .andExpect(jsonPath("$.events[0].venue", notNullValue()))
            .andExpect(jsonPath("$.total", greaterThanOrEqualTo(1)));

        String createPlan = mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(creator.token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "title":"Spring core smoke",
                      "activity_type":"coffee",
                      "participant_ids":["%s"]
                    }
                    """.formatted(participant.userId())))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.plan.id", notNullValue()))
            .andExpect(jsonPath("$.plan.lifecycle_state").value("active"))
            .andExpect(jsonPath("$.plan.participants", hasSize(2)))
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode createdPlan = read(createPlan, "/plan");
        String planId = text(createdPlan, "/id");
        String shareToken = text(createdPlan, "/share_token");

        mockMvc.perform(get("/api/plans?participant=me").header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plans", hasSize(greaterThanOrEqualTo(1))));

        mockMvc.perform(get("/api/plans/" + planId).header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.id").value(planId))
            .andExpect(jsonPath("$.plan.participants", hasSize(2)));

        mockMvc.perform(get("/api/plans/by-token/" + shareToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.id").value(planId))
            .andExpect(jsonPath("$.plan.participant_count").value(2));

        mockMvc.perform(post("/api/plans/by-token/" + shareToken + "/join")
                .header("Authorization", bearer(joiner.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.already_joined").value(false))
            .andExpect(jsonPath("$.plan.participants[?(@.user_id == '" + joiner.userId() + "')].status").value("going"));

        mockMvc.perform(post("/api/plans/" + planId + "/participants")
                .header("Authorization", bearer(creator.token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"user_id\":\"" + invitedUserId + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.participant.user_id").value(invitedUserId))
            .andExpect(jsonPath("$.participant.status").value("invited"));

        mockMvc.perform(get("/api/plans/" + planId + "/participants")
                .header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.participants", hasSize(4)));

        String placeProposalId = createPlaceProposal(creator.token(), planId);
        String timeProposalId = createTimeProposal(creator.token(), planId);

        mockMvc.perform(get("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(participant.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.proposals", hasSize(2)));

        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + placeProposalId + "/vote")
                .header("Authorization", bearer(participant.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.vote.proposal_id").value(placeProposalId))
            .andExpect(jsonPath("$.vote.voter_id").value(participant.userId()));

        mockMvc.perform(delete("/api/plans/" + planId + "/proposals/" + placeProposalId + "/vote")
                .header("Authorization", bearer(participant.token())))
            .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/plans/" + planId + "/finalize")
                .header("Authorization", bearer(creator.token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "place_proposal_id":"%s",
                      "time_proposal_id":"%s"
                    }
                    """.formatted(placeProposalId, timeProposalId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.id").value(planId))
            .andExpect(jsonPath("$.plan.lifecycle_state").value("finalized"))
            .andExpect(jsonPath("$.plan.place_status").value("confirmed"))
            .andExpect(jsonPath("$.plan.time_status").value("confirmed"));

        mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(creator.token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"place\",\"value_text\":\"Blocked after finalize\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"))
            .andExpect(jsonPath("$.message").value("Cannot propose in non-active plan"));
        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + placeProposalId + "/vote")
                .header("Authorization", bearer(participant.token())))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"))
            .andExpect(jsonPath("$.message").value("Cannot vote in non-active plan"));

        mockMvc.perform(post("/api/plans/" + planId + "/unfinalize")
                .header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.id").value(planId))
            .andExpect(jsonPath("$.plan.lifecycle_state").value("active"));

        String afterUnfinalizeProposalId = createPlaceProposal(creator.token(), planId, "Works after unfinalize");
        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + afterUnfinalizeProposalId + "/vote")
                .header("Authorization", bearer(participant.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.vote.proposal_id").value(afterUnfinalizeProposalId));

        String messageOne = mockMvc.perform(post("/api/plans/" + planId + "/messages")
                .header("Authorization", bearer(participant.token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"smoke hello\",\"client_message_id\":\"smoke-dedup-1\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.message.text").value("smoke hello"))
            .andExpect(jsonPath("$.message.client_message_id").value("smoke-dedup-1"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        String messageId = text(read(messageOne, "/message"), "/id");

        mockMvc.perform(post("/api/plans/" + planId + "/messages")
                .header("Authorization", bearer(participant.token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"smoke duplicate\",\"client_message_id\":\"smoke-dedup-1\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.message.id").value(messageId))
            .andExpect(jsonPath("$.message.text").value("smoke hello"));
        expectCount(
            "SELECT COUNT(*) FROM messages WHERE context_id = ?::uuid AND context_type = 'plan' AND client_message_id = 'smoke-dedup-1'",
            planId,
            1
        );

        mockMvc.perform(get("/api/plans/" + planId + "/messages")
                .header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.messages[*].type", hasItem("proposal_card")))
            .andExpect(jsonPath("$.messages[*].type", hasItem("system")))
            .andExpect(jsonPath("$.messages[*].type", hasItem("user")));

        mockMvc.perform(post("/api/plans/" + planId + "/complete")
                .header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.lifecycle_state").value("completed"));

        String repeatedPlan = mockMvc.perform(post("/api/plans/" + planId + "/repeat")
                .header("Authorization", bearer(creator.token())))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.plan.lifecycle_state").value("active"))
            .andExpect(jsonPath("$.plan.participants", hasSize(4)))
            .andReturn()
            .getResponse()
            .getContentAsString();
        String repeatedPlanId = text(read(repeatedPlan, "/plan"), "/id");

        String notificationId = jdbc.queryForObject(
            "SELECT id::text FROM notifications WHERE user_id = ?::uuid ORDER BY created_at DESC LIMIT 1",
            String.class,
            creator.userId()
        );
        mockMvc.perform(get("/api/notifications").header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.notifications", hasSize(greaterThanOrEqualTo(1))))
            .andExpect(jsonPath("$.unread_count", greaterThanOrEqualTo(1)));
        mockMvc.perform(patch("/api/notifications/" + notificationId + "/read")
                .header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.notification.read").value(true));
        mockMvc.perform(patch("/api/notifications/read-all").header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(post("/api/plans/" + repeatedPlanId + "/complete")
                .header("Authorization", bearer(creator.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.lifecycle_state").value("completed"));
    }

    private Login login(String phone) throws Exception {
        mockMvc.perform(post("/api/auth/otp/send")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));

        String verifyJson = mockMvc.perform(post("/api/auth/otp/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\",\"code\":\"1111\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.access_token", notNullValue()))
            .andExpect(jsonPath("$.refresh_token", notNullValue()))
            .andExpect(jsonPath("$.user.id", notNullValue()))
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode response = read(verifyJson);
        return new Login(text(response, "/access_token"), text(response, "/user/id"));
    }

    private String createPlaceProposal(String token, String planId) throws Exception {
        return createPlaceProposal(token, planId, "Smoke cafe");
    }

    private String createPlaceProposal(String token, String planId, String valueText) throws Exception {
        String response = mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "type":"place",
                      "value_text":"%s",
                      "value_lat":55.75,
                      "value_lng":37.61
                    }
                    """.formatted(valueText)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.proposal.id", notNullValue()))
            .andExpect(jsonPath("$.proposal.type").value("place"))
            .andExpect(jsonPath("$.proposal.votes", hasSize(0)))
            .andReturn()
            .getResponse()
            .getContentAsString();
        return text(read(response, "/proposal"), "/id");
    }

    private String createTimeProposal(String token, String planId) throws Exception {
        String response = mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "type":"time",
                      "value_text":"20:00",
                      "value_datetime":"2026-05-01T20:00:00+03:00"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.proposal.id", notNullValue()))
            .andExpect(jsonPath("$.proposal.type").value("time"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        return text(read(response, "/proposal"), "/id");
    }

    private String userId(String phone) {
        return jdbc.queryForObject("SELECT id::text FROM users WHERE phone = ?", String.class, phone);
    }

    private void expectCount(String sql, String id, int expected) {
        Integer count = jdbc.queryForObject(sql, Integer.class, id);
        assertThat(count).isEqualTo(expected);
    }

    private JsonNode read(String json) throws Exception {
        return JSON.readTree(json);
    }

    private JsonNode read(String json, String pointer) throws Exception {
        return read(json).at(pointer);
    }

    private String text(JsonNode node, String pointer) {
        return node.at(pointer).asText();
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private record Login(String token, String userId) {
    }
}
