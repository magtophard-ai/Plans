package com.plans.backend.api.smoke;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plans.backend.persistence.DevSeedRunner;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "JWT_SECRET=dev-secret",
        "OTP_CODE=1111",
    }
)
@AutoConfigureMockMvc
@Testcontainers
class SpringRealtimeSmokeIntegrationTest {
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

    @LocalServerPort
    private int port;

    @BeforeEach
    void seed() {
        devSeedRunner.run();
    }

    @Test
    void realtimeSmokeCoversPlanEventsNotificationChannelAndForbiddenSubscribe() throws Exception {
        Login creator = login("+79990000000");
        Login participant = login("+79991111111");
        Login invitee = login("+79992222222");
        Login outsider = login("+79994444444");

        String planId = createPlan(creator.token(), participant.userId());

        TestWs participantWs = connect(participant.token());
        participantWs.subscribe("plan:" + planId);
        TestWs creatorWs = connect(creator.token());
        creatorWs.subscribe("plan:" + planId);
        TestWs inviteeWs = connect(invitee.token());
        TestWs outsiderWs = connect(outsider.token());
        outsiderWs.expectSubscribeError("plan:" + planId, "Not a participant of this plan");

        String messageId = postMessage(creator.token(), planId);
        JsonNode messageEvent = participantWs.waitForEvent("plan.message.created");
        assertThat(messageEvent.at("/channel").asText()).isEqualTo("plan:" + planId);
        assertThat(messageEvent.at("/payload/id").asText()).isEqualTo(messageId);
        assertThat(messageEvent.at("/payload/text").asText()).isEqualTo("RT hello");
        assertThat(messageEvent.at("/payload/client_message_id").asText()).isEqualTo("rt-cmid-1");

        String proposalId = createPlaceProposal(creator.token(), planId);
        JsonNode proposalEvent = participantWs.waitForEvent("plan.proposal.created");
        assertThat(proposalEvent.at("/payload/id").asText()).isEqualTo(proposalId);
        assertThat(proposalEvent.at("/payload/value_text").asText()).isEqualTo("RT Place");
        assertThat(proposalEvent.at("/payload/votes").isArray()).isTrue();
        assertThat(proposalEvent.at("/payload/votes")).isEmpty();

        vote(participant.token(), planId, proposalId);
        JsonNode voteAdded = creatorWs.waitForEvent("plan.vote.changed");
        assertThat(voteAdded.at("/payload/action").asText()).isEqualTo("added");
        assertThat(voteAdded.at("/payload/proposal_id").asText()).isEqualTo(proposalId);
        assertThat(voteAdded.at("/payload/voter_id").asText()).isEqualTo(participant.userId());
        assertThat(voteAdded.at("/payload/vote_id").asText()).isNotBlank();

        unvote(participant.token(), planId, proposalId);
        JsonNode voteRemoved = creatorWs.waitForEvent("plan.vote.changed");
        assertThat(voteRemoved.at("/payload/action").asText()).isEqualTo("removed");
        assertThat(voteRemoved.at("/payload/proposal_id").asText()).isEqualTo(proposalId);
        assertThat(voteRemoved.at("/payload/voter_id").asText()).isEqualTo(participant.userId());

        inviteeWs.subscribe("user:" + invitee.userId());
        inviteParticipant(creator.token(), planId, invitee.userId());
        JsonNode participantAdded = participantWs.waitForEvent("plan.participant.added");
        assertThat(participantAdded.at("/payload/participant/user_id").asText()).isEqualTo(invitee.userId());
        JsonNode notificationCreated = inviteeWs.waitForEvent("notification.created");
        assertThat(notificationCreated.at("/channel").asText()).isEqualTo("user:" + invitee.userId());
        assertThat(notificationCreated.at("/payload/notificationId").asText()).isNotBlank();
        assertThat(notificationCreated.at("/payload/type").asText()).isEqualTo("plan_invite");
        assertThat(notificationCreated.at("/payload/payload/plan_id").asText()).isEqualTo(planId);
        assertThat(notificationCreated.at("/payload/createdAt").asText()).isNotBlank();

        updateParticipant(invitee.token(), planId, invitee.userId(), "thinking");
        JsonNode participantUpdated = participantWs.waitForEvent("plan.participant.updated");
        assertThat(participantUpdated.at("/payload/participant/user_id").asText()).isEqualTo(invitee.userId());
        assertThat(participantUpdated.at("/payload/participant/status").asText()).isEqualTo("thinking");

        removeParticipant(creator.token(), planId, invitee.userId());
        JsonNode participantRemoved = participantWs.waitForEvent("plan.participant.removed");
        assertThat(participantRemoved.at("/payload/user_id").asText()).isEqualTo(invitee.userId());

        String timeProposalId = createTimeProposal(creator.token(), planId);
        participantWs.waitForEvent("plan.proposal.created");
        finalizePlan(creator.token(), planId, proposalId, timeProposalId);
        JsonNode finalized = participantWs.waitForEvent("plan.finalized");
        assertThat(finalized.at("/payload/plan_id").asText()).isEqualTo(planId);
        assertThat(finalized.at("/payload/place_proposal_id").asText()).isEqualTo(proposalId);
        assertThat(finalized.at("/payload/time_proposal_id").asText()).isEqualTo(timeProposalId);

        unfinalizePlan(creator.token(), planId);
        JsonNode unfinalized = participantWs.waitForEvent("plan.unfinalized");
        assertThat(unfinalized.at("/payload/plan_id").asText()).isEqualTo(planId);

        completePlan(creator.token(), planId);
        JsonNode completed = participantWs.waitForEvent("plan.completed");
        assertThat(completed.at("/payload/plan_id").asText()).isEqualTo(planId);

        String cancelPlanId = createPlan(creator.token(), participant.userId());
        participantWs.subscribe("plan:" + cancelPlanId);
        cancelPlan(creator.token(), cancelPlanId);
        JsonNode cancelled = participantWs.waitForEvent("plan.cancelled");
        assertThat(cancelled.at("/payload/plan_id").asText()).isEqualTo(cancelPlanId);

        closeAll(participantWs, creatorWs, inviteeWs, outsiderWs);
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
            .andExpect(jsonPath("$.access_token", notNullValue()))
            .andExpect(jsonPath("$.user.id", notNullValue()))
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode response = JSON.readTree(verifyJson);
        return new Login(response.at("/access_token").asText(), response.at("/user/id").asText());
    }

    private String createPlan(String token, String participantId) throws Exception {
        String json = mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "title":"Spring realtime smoke",
                      "activity_type":"bar",
                      "participant_ids":["%s"]
                    }
                    """.formatted(participantId)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return JSON.readTree(json).at("/plan/id").asText();
    }

    private String postMessage(String token, String planId) throws Exception {
        String json = mockMvc.perform(post("/api/plans/" + planId + "/messages")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"RT hello\",\"client_message_id\":\"rt-cmid-1\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return JSON.readTree(json).at("/message/id").asText();
    }

    private String createPlaceProposal(String token, String planId) throws Exception {
        String json = mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"place\",\"value_text\":\"RT Place\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return JSON.readTree(json).at("/proposal/id").asText();
    }

    private String createTimeProposal(String token, String planId) throws Exception {
        String json = mockMvc.perform(post("/api/plans/" + planId + "/proposals")
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
            .andReturn()
            .getResponse()
            .getContentAsString();
        return JSON.readTree(json).at("/proposal/id").asText();
    }

    private void vote(String token, String planId, String proposalId) throws Exception {
        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + proposalId + "/vote")
                .header("Authorization", bearer(token)))
            .andExpect(status().isOk());
    }

    private void unvote(String token, String planId, String proposalId) throws Exception {
        mockMvc.perform(delete("/api/plans/" + planId + "/proposals/" + proposalId + "/vote")
                .header("Authorization", bearer(token)))
            .andExpect(status().isNoContent());
    }

    private void inviteParticipant(String token, String planId, String userId) throws Exception {
        mockMvc.perform(post("/api/plans/" + planId + "/participants")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"user_id\":\"" + userId + "\"}"))
            .andExpect(status().isOk());
    }

    private void updateParticipant(String token, String planId, String userId, String participantStatus) throws Exception {
        mockMvc.perform(patch("/api/plans/" + planId + "/participants/" + userId)
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"" + participantStatus + "\"}"))
            .andExpect(status().isOk());
    }

    private void removeParticipant(String token, String planId, String userId) throws Exception {
        mockMvc.perform(delete("/api/plans/" + planId + "/participants/" + userId)
                .header("Authorization", bearer(token)))
            .andExpect(status().isNoContent());
    }

    private void finalizePlan(String token, String planId, String placeProposalId, String timeProposalId) throws Exception {
        mockMvc.perform(post("/api/plans/" + planId + "/finalize")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "place_proposal_id":"%s",
                      "time_proposal_id":"%s"
                    }
                    """.formatted(placeProposalId, timeProposalId)))
            .andExpect(status().isOk());
    }

    private void unfinalizePlan(String token, String planId) throws Exception {
        mockMvc.perform(post("/api/plans/" + planId + "/unfinalize")
                .header("Authorization", bearer(token)))
            .andExpect(status().isOk());
    }

    private void completePlan(String token, String planId) throws Exception {
        mockMvc.perform(post("/api/plans/" + planId + "/complete")
                .header("Authorization", bearer(token)))
            .andExpect(status().isOk());
    }

    private void cancelPlan(String token, String planId) throws Exception {
        mockMvc.perform(post("/api/plans/" + planId + "/cancel")
                .header("Authorization", bearer(token)))
            .andExpect(status().isOk());
    }

    private TestWs connect(String token) throws Exception {
        TestWs ws = new TestWs();
        WebSocketSession session = new StandardWebSocketClient()
            .execute(ws, null, URI.create("ws://localhost:" + port + "/api/ws"))
            .get();
        ws.session(session);
        ws.send(Map.of("type", "auth", "token", token));
        JsonNode auth = ws.waitForType("auth_ok");
        assertThat(auth.at("/userId").asText()).isNotBlank();
        return ws;
    }

    private void closeAll(TestWs... clients) throws Exception {
        for (TestWs client : clients) {
            client.close();
        }
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private record Login(String token, String userId) {
    }

    private static class TestWs extends TextWebSocketHandler {
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        private WebSocketSession session;

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
            messages.add(JSON.readTree(message.getPayload()));
        }

        @Override
        public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
            messages.add(JSON.createObjectNode().put("type", "closed").put("code", status.getCode()));
        }

        void session(WebSocketSession session) {
            this.session = session;
        }

        void subscribe(String channel) throws Exception {
            send(Map.of("type", "subscribe", "channel", channel));
            JsonNode subscribed = waitForType("subscribed");
            assertThat(subscribed.at("/channel").asText()).isEqualTo(channel);
        }

        void expectSubscribeError(String channel, String message) throws Exception {
            send(Map.of("type", "subscribe", "channel", channel));
            JsonNode error = waitForType("error");
            assertThat(error.at("/message").asText()).isEqualTo(message);
        }

        JsonNode waitForEvent(String event) throws Exception {
            return waitFor(node -> "event".equals(node.at("/type").asText()) && event.equals(node.at("/event").asText()));
        }

        JsonNode waitForType(String type) throws Exception {
            return waitFor(node -> type.equals(node.at("/type").asText()));
        }

        void send(Map<String, Object> payload) throws Exception {
            session.sendMessage(new TextMessage(JSON.writeValueAsString(payload)));
        }

        void close() throws Exception {
            if (session != null && session.isOpen()) {
                session.close();
            }
        }

        private JsonNode waitFor(MessagePredicate predicate) throws Exception {
            long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
            while (System.nanoTime() < deadline) {
                JsonNode message = messages.poll(Duration.ofMillis(200).toMillis(), java.util.concurrent.TimeUnit.MILLISECONDS);
                if (message == null) {
                    continue;
                }
                if ("ping".equals(message.at("/type").asText())) {
                    send(Map.of("type", "pong"));
                    continue;
                }
                if (predicate.matches(message)) {
                    return message;
                }
            }
            throw new AssertionError("Timed out waiting for WebSocket message. Remaining: " + messages);
        }
    }

    @FunctionalInterface
    private interface MessagePredicate {
        boolean matches(JsonNode message);
    }
}
