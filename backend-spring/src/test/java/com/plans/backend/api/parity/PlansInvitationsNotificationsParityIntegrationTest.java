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
    void fetchPlanByValidShareTokenReturnsFastifyPreviewWithoutAuth() throws Exception {
        String token = login("+79990000000");
        String shareToken = createPlanShareToken(token, "Shared preview");

        mockMvc.perform(get("/api/plans/by-token/" + shareToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.title").value("Shared preview"))
            .andExpect(jsonPath("$.plan.activity_type").value("other"))
            .andExpect(jsonPath("$.plan.lifecycle_state").value("active"))
            .andExpect(jsonPath("$.plan.share_token").value(shareToken))
            .andExpect(jsonPath("$.plan.creator.name").value("Я"))
            .andExpect(jsonPath("$.plan.participant_count").value(1))
            .andExpect(jsonPath("$.plan.max_participants").value(15))
            .andExpect(jsonPath("$.plan.participants").doesNotExist())
            .andExpect(jsonPath("$.plan.proposals").doesNotExist());
    }

    @Test
    void shareTokenInvalidAndUnauthorizedBehaviorMatchesFastify() throws Exception {
        String token = login("+79990000000");
        String shareToken = createPlanShareToken(token, "Auth required join");

        mockMvc.perform(get("/api/plans/by-token/not-a-real-token"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Plan not found"));

        mockMvc.perform(post("/api/plans/by-token/" + shareToken + "/join"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
            .andExpect(jsonPath("$.message").value("Unauthorized"));

        mockMvc.perform(post("/api/plans/by-token/not-a-real-token/join")
                .header("Authorization", bearer(token)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Plan not found"));
    }

    @Test
    void joinPlanByTokenAddsGoingParticipantAndNotifiesCreator() throws Exception {
        String creatorToken = login("+79990000000");
        String joinerToken = login("+79991111111");
        String creatorId = userId("+79990000000");
        String joinerId = userId("+79991111111");
        String shareToken = createPlanShareToken(creatorToken, "Join by link");
        String planId = planIdForShareToken(shareToken);

        mockMvc.perform(post("/api/plans/by-token/" + shareToken + "/join")
                .header("Authorization", bearer(joinerToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.already_joined").value(false))
            .andExpect(jsonPath("$.plan.title").value("Join by link"))
            .andExpect(jsonPath("$.plan.participants", hasSize(2)))
            .andExpect(jsonPath("$.plan.participants[?(@.user_id == '" + joinerId + "')].status").value("going"));

        expectCount(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ?::uuid AND type = 'plan_join_via_link' AND payload->>'joiner_id' = ? AND payload->>'plan_id' = ?",
            creatorId,
            joinerId,
            planId,
            1
        );
        String joinerName = jdbc.queryForObject(
            "SELECT payload->>'joiner_name' FROM notifications WHERE user_id = ?::uuid AND payload->>'joiner_id' = ? AND payload->>'plan_id' = ? ORDER BY created_at DESC LIMIT 1",
            String.class,
            creatorId,
            joinerId,
            planId
        );
        org.assertj.core.api.Assertions.assertThat(joinerName).isEqualTo("Маша");
    }

    @Test
    void joinPlanByTokenReturnsAlreadyJoinedBeforeFullCheck() throws Exception {
        String creatorToken = login("+79990000000");
        String shareToken = createPlanShareToken(creatorToken, "Already joined link");

        mockMvc.perform(post("/api/plans/by-token/" + shareToken + "/join")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.already_joined").value(true))
            .andExpect(jsonPath("$.plan.title").value("Already joined link"))
            .andExpect(jsonPath("$.plan.participants", hasSize(1)));
    }

    @Test
    void joinPlanByTokenRejectsFullPlan() throws Exception {
        String creatorToken = login("+79990000000");
        String joinerToken = login("+79991111111");
        String shareToken = createPlanShareToken(
            creatorToken,
            "Full share link",
            "\"participant_ids\":" + participantIds(14, 300)
        );

        mockMvc.perform(post("/api/plans/by-token/" + shareToken + "/join")
                .header("Authorization", bearer(joinerToken)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PLAN_FULL"))
            .andExpect(jsonPath("$.message").value("Plan has max 15 participants"));
    }

    @Test
    void joinPlanByTokenLifecycleRestrictionsMatchFastify() throws Exception {
        String creatorToken = login("+79990000000");
        String joinerToken = login("+79991111111");
        String completedToken = createPlanShareToken(creatorToken, "Completed link");
        String cancelledToken = createPlanShareToken(creatorToken, "Cancelled link");
        String finalizedToken = createPlanShareToken(creatorToken, "Finalized link");
        setPlanLifecycle(completedToken, "completed");
        setPlanLifecycle(cancelledToken, "cancelled");
        setPlanLifecycle(finalizedToken, "finalized");

        mockMvc.perform(post("/api/plans/by-token/" + completedToken + "/join")
                .header("Authorization", bearer(joinerToken)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"))
            .andExpect(jsonPath("$.message").value("Plan is not joinable"));

        mockMvc.perform(post("/api/plans/by-token/" + cancelledToken + "/join")
                .header("Authorization", bearer(joinerToken)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"))
            .andExpect(jsonPath("$.message").value("Plan is not joinable"));

        mockMvc.perform(post("/api/plans/by-token/" + finalizedToken + "/join")
                .header("Authorization", bearer(joinerToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.already_joined").value(false))
            .andExpect(jsonPath("$.plan.lifecycle_state").value("finalized"));
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
    void proposalsAndVotingMatchFastifyParityRules() throws Exception {
        String creatorToken = login("+79990000000");
        String participantToken = login("+79991111111");
        String participantId = userId("+79991111111");
        String nonParticipantToken = login("+79995555555");
        String planId = createPlan(creatorToken, "Proposal parity", participantId);

        mockMvc.perform(get("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.proposals", hasSize(0)));

        String placeResponse = mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "type":"place",
                      "value_text":"Бар Центральный",
                      "value_lat":55.75,
                      "value_lng":37.61
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.proposal.type").value("place"))
            .andExpect(jsonPath("$.proposal.value_text").value("Бар Центральный"))
            .andExpect(jsonPath("$.proposal.votes", hasSize(0)))
            .andReturn()
            .getResponse()
            .getContentAsString();
        String placeProposalId = read(placeResponse, "/proposal/id").asText();

        String timeResponse = mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "type":"time",
                      "value_text":"20:00",
                      "value_datetime":"2026-05-01T20:00:00+03:00"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.proposal.type").value("time"))
            .andExpect(jsonPath("$.proposal.value_text").value("20:00"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        String timeProposalId = read(timeResponse, "/proposal/id").asText();

        mockMvc.perform(get("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(nonParticipantToken)))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(nonParticipantToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"place\",\"value_text\":\"Nope\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.message").value("Only participants can propose"));
        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + placeProposalId + "/vote")
                .header("Authorization", bearer(nonParticipantToken)))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.message").value("Only participants can vote"));

        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + placeProposalId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.vote.proposal_id").value(placeProposalId))
            .andExpect(jsonPath("$.vote.voter_id").value(participantId));

        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + placeProposalId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ALREADY_VOTED"))
            .andExpect(jsonPath("$.message").value("Already voted on this proposal"));
        expectCount(
            "SELECT COUNT(*) FROM votes WHERE proposal_id = ?::uuid AND voter_id = ?::uuid",
            placeProposalId,
            participantId,
            1
        );

        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + timeProposalId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isOk());

        String secondPlaceId = createProposal(creatorToken, planId, "place", "Бар второй");
        String thirdPlaceId = createProposal(creatorToken, planId, "place", "Бар третий");
        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + secondPlaceId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + thirdPlaceId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("MAX_VOTES_EXCEEDED"))
            .andExpect(jsonPath("$.message").value("Max 2 votes per proposal type"));

        mockMvc.perform(delete("/api/plans/" + planId + "/proposals/" + placeProposalId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isNoContent());
        expectCount(
            "SELECT COUNT(*) FROM votes WHERE proposal_id = ?::uuid AND voter_id = ?::uuid",
            placeProposalId,
            participantId,
            0
        );
    }

    @Test
    void finalizedAndMissingProposalCasesMatchFastifyErrorShape() throws Exception {
        String creatorToken = login("+79990000000");
        String participantToken = login("+79991111111");
        String participantId = userId("+79991111111");
        String planId = createPlan(creatorToken, "Finalized proposals", participantId);
        String proposalId = createProposal(creatorToken, planId, "place", "До финала");
        setPlanLifecycleById(planId, "finalized");

        mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"place\",\"value_text\":\"Поздно\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"))
            .andExpect(jsonPath("$.message").value("Cannot propose in non-active plan"));

        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + proposalId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"))
            .andExpect(jsonPath("$.message").value("Cannot vote in non-active plan"));

        String missingPlan = UUID.randomUUID().toString();
        mockMvc.perform(get("/api/plans/" + missingPlan + "/proposals")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Plan not found"));

        String activePlanId = createPlan(creatorToken, "Missing proposals", participantId);
        String missingProposal = UUID.randomUUID().toString();
        mockMvc.perform(post("/api/plans/" + activePlanId + "/proposals/" + missingProposal + "/vote")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Proposal not found"));

        mockMvc.perform(delete("/api/plans/" + activePlanId + "/proposals/" + missingProposal + "/vote")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Vote not found"));
    }

    @Test
    void unvoteIsScopedToProposalPlan() throws Exception {
        String creatorToken = login("+79990000000");
        String participantToken = login("+79991111111");
        String participantId = userId("+79991111111");
        String planAId = createPlan(creatorToken, "Plan A cross unvote", participantId);
        String planBId = createPlan(creatorToken, "Plan B cross unvote", participantId);
        String planBProposalId = createProposal(creatorToken, planBId, "place", "Plan B place");

        mockMvc.perform(post("/api/plans/" + planBId + "/proposals/" + planBProposalId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isOk());
        expectCount(
            "SELECT COUNT(*) FROM votes WHERE proposal_id = ?::uuid AND voter_id = ?::uuid",
            planBProposalId,
            participantId,
            1
        );

        mockMvc.perform(delete("/api/plans/" + planAId + "/proposals/" + planBProposalId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Vote not found"));

        expectCount(
            "SELECT COUNT(*) FROM votes WHERE proposal_id = ?::uuid AND voter_id = ?::uuid",
            planBProposalId,
            participantId,
            1
        );
    }

    @Test
    void creatorCanFinalizeAndUnfinalizeWithProposalStatusAndSideEffects() throws Exception {
        String creatorToken = login("+79990000000");
        String participantToken = login("+79991111111");
        String participantId = userId("+79991111111");
        String planId = createPlan(creatorToken, "Lifecycle parity", participantId);
        String selectedPlaceId = createProposal(creatorToken, planId, "place", "Кафе финал");
        String otherPlaceId = createProposal(creatorToken, planId, "place", "Бар запасной");
        String selectedTimeId = createProposalWithFields(
            creatorToken,
            planId,
            "time",
            "2026-06-01T19:00:00+03:00",
            "\"value_datetime\":\"2026-06-01T19:00:00+03:00\""
        );
        String otherTimeId = createProposalWithFields(
            creatorToken,
            planId,
            "time",
            "2026-06-02T20:00:00+03:00",
            "\"value_datetime\":\"2026-06-02T20:00:00+03:00\""
        );

        mockMvc.perform(post("/api/plans/" + planId + "/finalize")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"place_proposal_id\":\"" + selectedPlaceId + "\",\"time_proposal_id\":\"" + selectedTimeId + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.id").value(planId))
            .andExpect(jsonPath("$.plan.lifecycle_state").value("finalized"))
            .andExpect(jsonPath("$.plan.place_status").value("confirmed"))
            .andExpect(jsonPath("$.plan.time_status").value("confirmed"))
            .andExpect(jsonPath("$.plan.confirmed_place_text").value("Кафе финал"))
            .andExpect(jsonPath("$.plan.confirmed_time", notNullValue()));

        expectCount("SELECT COUNT(*) FROM plan_proposals WHERE id = ?::uuid AND status = 'finalized'", selectedPlaceId, 1);
        expectCount("SELECT COUNT(*) FROM plan_proposals WHERE id = ?::uuid AND status = 'superseded'", otherPlaceId, 1);
        expectCount("SELECT COUNT(*) FROM plan_proposals WHERE id = ?::uuid AND status = 'finalized'", selectedTimeId, 1);
        expectCount("SELECT COUNT(*) FROM plan_proposals WHERE id = ?::uuid AND status = 'superseded'", otherTimeId, 1);
        expectCount("SELECT COUNT(*) FROM notifications WHERE type = 'plan_finalized' AND payload->>'plan_id' = ?", planId, 2);
        expectCount(
            "SELECT COUNT(*) FROM messages WHERE context_id = ?::uuid AND type = 'system' AND text = 'План подтверждён'",
            planId,
            1
        );

        mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"place\",\"value_text\":\"После финала\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"));
        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + selectedPlaceId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"));

        mockMvc.perform(post("/api/plans/" + planId + "/unfinalize")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan.id").value(planId))
            .andExpect(jsonPath("$.plan.lifecycle_state").value("active"))
            .andExpect(jsonPath("$.plan.place_status").value("proposed"))
            .andExpect(jsonPath("$.plan.time_status").value("proposed"));

        expectCount("SELECT COUNT(*) FROM plan_proposals WHERE plan_id = ?::uuid AND status != 'active'", planId, 0);
        expectCount("SELECT COUNT(*) FROM notifications WHERE type = 'plan_unfinalized' AND payload->>'plan_id' = ?", planId, 2);
        expectCount(
            "SELECT COUNT(*) FROM messages WHERE context_id = ?::uuid AND type = 'system' AND text = 'Подтверждение отменено'",
            planId,
            1
        );
        String newProposalId = createProposal(creatorToken, planId, "place", "После отмены");
        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + newProposalId + "/vote")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.vote.proposal_id").value(newProposalId));
    }

    @Test
    void lifecycleEndpointErrorsMatchFastifyShapes() throws Exception {
        String creatorToken = login("+79990000000");
        String participantToken = login("+79991111111");
        String participantId = userId("+79991111111");
        String planId = createPlan(creatorToken, "Lifecycle errors", participantId);
        String placeProposalId = createProposal(creatorToken, planId, "place", "Правильное место");
        String timeProposalId = createProposalWithFields(
            creatorToken,
            planId,
            "time",
            "2026-06-01T19:00:00+03:00",
            "\"value_datetime\":\"2026-06-01T19:00:00+03:00\""
        );
        String otherPlanId = createPlan(creatorToken, "Other lifecycle", participantId);
        String otherPlaceId = createProposal(creatorToken, otherPlanId, "place", "Чужое место");
        String missingPlanId = UUID.randomUUID().toString();

        mockMvc.perform(post("/api/plans/" + planId + "/finalize")
                .header("Authorization", bearer(participantToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("FORBIDDEN"))
            .andExpect(jsonPath("$.message").value("Only creator can finalize"));
        mockMvc.perform(post("/api/plans/" + missingPlanId + "/finalize")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.message").value("Plan not found"));
        mockMvc.perform(post("/api/plans/" + planId + "/finalize")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_STATE"))
            .andExpect(jsonPath("$.message").value("Plan must have confirmed place and time before finalizing"));
        mockMvc.perform(post("/api/plans/" + planId + "/finalize")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"place_proposal_id\":\"" + otherPlaceId + "\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
            .andExpect(jsonPath("$.message").value("Place proposal not found"));
        mockMvc.perform(post("/api/plans/" + planId + "/finalize")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"place_proposal_id\":\"" + timeProposalId + "\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Place proposal not found"));

        setPlanLifecycleById(planId, "completed");
        mockMvc.perform(post("/api/plans/" + planId + "/finalize")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"place_proposal_id\":\"" + placeProposalId + "\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Can only finalize active plans"));
        mockMvc.perform(post("/api/plans/" + planId + "/unfinalize")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Can only unfinalize finalized plans"));
        setPlanLifecycleById(planId, "cancelled");
        mockMvc.perform(post("/api/plans/" + planId + "/unfinalize")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Can only unfinalize finalized plans"));
        setPlanLifecycleById(planId, "active");
        mockMvc.perform(post("/api/plans/" + planId + "/unfinalize")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Can only unfinalize finalized plans"));

        mockMvc.perform(post("/api/plans/" + planId + "/finalize")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"place_proposal_id\":\"" + placeProposalId + "\",\"time_proposal_id\":\"" + timeProposalId + "\"}"))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/plans/" + planId + "/finalize")
                .header("Authorization", bearer(creatorToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Can only finalize active plans"));
        mockMvc.perform(post("/api/plans/" + planId + "/unfinalize")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.message").value("Only creator can unfinalize"));
        mockMvc.perform(post("/api/plans/" + missingPlanId + "/unfinalize")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.message").value("Plan not found"));
    }

    @Test
    void creatorCanRepeatCompletedPlanWithParticipantsInvitationsAndNotifications() throws Exception {
        String creatorToken = login("+79990000000");
        String participantOneId = userId("+79991111111");
        String participantTwoId = userId("+79992222222");
        String planId = createPlanWithParticipantIds(
            creatorToken,
            "Repeat source",
            "coffee",
            "[\"" + participantOneId + "\",\"" + participantTwoId + "\"]"
        );
        String proposalId = createProposal(creatorToken, planId, "place", "Не копировать");
        mockMvc.perform(post("/api/plans/" + planId + "/proposals/" + proposalId + "/vote")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isOk());
        setPlanLifecycleById(planId, "completed");

        String response = mockMvc.perform(post("/api/plans/" + planId + "/repeat")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.plan.lifecycle_state").value("active"))
            .andExpect(jsonPath("$.plan.title").value("Repeat source"))
            .andExpect(jsonPath("$.plan.activity_type").value("coffee"))
            .andExpect(jsonPath("$.plan.place_status").value("undecided"))
            .andExpect(jsonPath("$.plan.time_status").value("undecided"))
            .andExpect(jsonPath("$.plan.confirmed_place_text").doesNotExist())
            .andExpect(jsonPath("$.plan.confirmed_time").doesNotExist())
            .andReturn()
            .getResponse()
            .getContentAsString();
        String newPlanId = read(response, "/plan/id").asText();

        expectCount("SELECT COUNT(*) FROM plan_proposals WHERE plan_id = ?::uuid", newPlanId, 0);
        expectCount("SELECT COUNT(*) FROM messages WHERE context_id = ?::uuid", newPlanId, 0);
        expectCount(
            "SELECT COUNT(*) FROM votes v JOIN plan_proposals pp ON pp.id = v.proposal_id WHERE pp.plan_id = ?::uuid",
            newPlanId,
            0
        );
        expectCount(
            "SELECT COUNT(*) FROM plan_participants WHERE plan_id = ?::uuid AND user_id = ?::uuid AND status = 'going'",
            newPlanId,
            userId("+79990000000"),
            1
        );
        expectCount(
            "SELECT COUNT(*) FROM plan_participants WHERE plan_id = ?::uuid AND status = 'invited'",
            newPlanId,
            2
        );
        expectCount("SELECT COUNT(*) FROM invitations WHERE type = 'plan' AND target_id = ?::uuid", newPlanId, 2);
        expectCount("SELECT COUNT(*) FROM notifications WHERE type = 'plan_invite' AND payload->>'plan_id' = ?", newPlanId, 2);
    }

    @Test
    void repeatErrorsMatchFastifyShapes() throws Exception {
        String creatorToken = login("+79990000000");
        String participantToken = login("+79991111111");
        String participantId = userId("+79991111111");
        String planId = createPlan(creatorToken, "Repeat errors", participantId);
        String missingPlanId = UUID.randomUUID().toString();

        mockMvc.perform(post("/api/plans/" + missingPlanId + "/repeat")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.message").value("Plan not found"));
        mockMvc.perform(post("/api/plans/" + planId + "/repeat")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Can only repeat completed plans"));
        setPlanLifecycleById(planId, "finalized");
        mockMvc.perform(post("/api/plans/" + planId + "/repeat")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Can only repeat completed plans"));
        setPlanLifecycleById(planId, "cancelled");
        mockMvc.perform(post("/api/plans/" + planId + "/repeat")
                .header("Authorization", bearer(creatorToken)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Can only repeat completed plans"));
        setPlanLifecycleById(planId, "completed");
        mockMvc.perform(post("/api/plans/" + planId + "/repeat")
                .header("Authorization", bearer(participantToken)))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.message").value("Only creator can repeat"));
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



    private String createPlan(String token, String title, String participantId) throws Exception {
        String response = mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"" + title + "\",\"activity_type\":\"coffee\",\"participant_ids\":[\"" + participantId + "\"]}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return read(response, "/plan/id").asText();
    }

    private String createProposal(String token, String planId, String type, String valueText) throws Exception {
        String response = mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"" + type + "\",\"value_text\":\"" + valueText + "\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return read(response, "/proposal/id").asText();
    }

    private String createProposalWithFields(
        String token,
        String planId,
        String type,
        String valueText,
        String extraFields
    ) throws Exception {
        String response = mockMvc.perform(post("/api/plans/" + planId + "/proposals")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"" + type + "\",\"value_text\":\"" + valueText + "\"," + extraFields + "}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return read(response, "/proposal/id").asText();
    }

    private String createPlanWithParticipantIds(
        String token,
        String title,
        String activityType,
        String participantIds
    ) throws Exception {
        String response = mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"title\":\"" + title + "\",\"activity_type\":\"" + activityType + "\",\"participant_ids\":"
                        + participantIds + "}"
                ))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return read(response, "/plan/id").asText();
    }

    private void setPlanLifecycleById(String planId, String lifecycle) {
        jdbc.update(
            "UPDATE plans SET lifecycle_state = ?::plan_lifecycle WHERE id = ?::uuid",
            lifecycle,
            planId
        );
    }
    private String createPlanShareToken(String token, String title, String... extraFields) throws Exception {
        StringBuilder body = new StringBuilder("{\"title\":\"").append(title).append('"');
        for (String field : extraFields) {
            body.append(',').append(field);
        }
        body.append('}');
        String response = mockMvc.perform(post("/api/plans")
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body.toString()))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return read(response, "/plan/share_token").asText();
    }

    private void setPlanLifecycle(String shareToken, String lifecycle) {
        jdbc.update(
            "UPDATE plans SET lifecycle_state = ?::plan_lifecycle WHERE share_token = ?",
            lifecycle,
            shareToken
        );
    }

    private String planIdForShareToken(String shareToken) {
        return jdbc.queryForObject("SELECT id::text FROM plans WHERE share_token = ?", String.class, shareToken);
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

    private void expectCount(String sql, String firstId, String secondId, String thirdId, int expected) {
        Integer count = jdbc.queryForObject(sql, Integer.class, firstId, secondId, thirdId);
        org.assertj.core.api.Assertions.assertThat(count).isEqualTo(expected);
    }

    private JsonNode read(String json, String pointer) throws Exception {
        return MAPPER.readTree(json).at(pointer);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
