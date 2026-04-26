package com.plans.backend.api.parity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plans.backend.persistence.DevSeedRunner;
import java.util.List;
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
class AuthDiscoveryParityIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17");

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
    void authFlowMatchesFastifyShapeAndAllowsAuthenticatedMeEndpoints() throws Exception {
        mockMvc.perform(post("/api/auth/otp/send")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"+7 999 000 00 00\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));

        String verifyJson = mockMvc.perform(post("/api/auth/otp/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"+79990000000\",\"code\":\"1111\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.access_token", notNullValue()))
            .andExpect(jsonPath("$.refresh_token", notNullValue()))
            .andExpect(jsonPath("$.user.phone").value("+79990000000"))
            .andReturn()
            .getResponse()
            .getContentAsString();

        String accessToken = JsonField.readString(verifyJson, "access_token");
        String refreshToken = JsonField.readString(verifyJson, "refresh_token");

        mockMvc.perform(post("/api/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refresh_token\":\"" + refreshToken + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.access_token", notNullValue()))
            .andExpect(jsonPath("$.refresh_token", notNullValue()));

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + accessToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.user.username").value("me"));

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + refreshToken))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
            .andExpect(jsonPath("$.message").value("Unauthorized"));

        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.user.username").value("me"));
    }

    @Test
    void otpCreatedUsersAvoidUsernameCollisions() throws Exception {
        register("+79991230000");
        register("+79994560000");

        List<String> usernames = jdbc.queryForList(
            "SELECT username FROM users WHERE phone IN ('+79991230000', '+79994560000')",
            String.class
        );
        assertThat(usernames).hasSize(2).doesNotHaveDuplicates();
    }

    @Test
    void authErrorsUseFastifyStatusAndEnvelope() throws Exception {
        mockMvc.perform(post("/api/auth/otp/send")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"123\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PHONE"))
            .andExpect(jsonPath("$.message").value("Invalid phone number"));

        mockMvc.perform(post("/api/auth/otp/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"+79990000000\",\"code\":\"0000\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("INVALID_OTP"))
            .andExpect(jsonPath("$.message").value("Invalid or expired OTP"));

        mockMvc.perform(get("/api/events"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
            .andExpect(jsonPath("$.message").value("Unauthorized"));
    }

    @Test
    void readOnlyDiscoveryEndpointsMatchFastifyResponseShapes() throws Exception {
        String token = login();
        String friendId = jdbc.queryForObject("SELECT id::text FROM users WHERE username = 'masha'", String.class);

        mockMvc.perform(get("/api/users/" + friendId).header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.user.username").value("masha"))
            .andExpect(jsonPath("$.user.friendship_status").value("friend"));

        mockMvc.perform(get("/api/users/friends").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.friends", hasSize(5)))
            .andExpect(jsonPath("$.friends[0].friendship_status").value("friend"));

        mockMvc.perform(get("/api/events").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events", hasSize(6)))
            .andExpect(jsonPath("$.events[0].venue.id", notNullValue()))
            .andExpect(jsonPath("$.events[0].friends_interested", notNullValue()))
            .andExpect(jsonPath("$.events[0].friends_plan_count", notNullValue()))
            .andExpect(jsonPath("$.total").value(6));

        mockMvc.perform(get("/api/events/62222222-2222-4222-8222-222222222222")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.event.title").value("Джазовый вечер"))
            .andExpect(jsonPath("$.event.venue.name").value("Бар «Ночь»"))
            .andExpect(jsonPath("$.event.friends_interested", hasSize(2)))
            .andExpect(jsonPath("$.event.friends_plan_count").value(2));

        mockMvc.perform(get("/api/venues/22222222-2222-4222-8222-222222222222")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.venue.name").value("Бар «Ночь»"));

        mockMvc.perform(get("/api/venues/22222222-2222-4222-8222-222222222222/events")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events", hasSize(2)))
            .andExpect(jsonPath("$.total").value(2));

        mockMvc.perform(get("/api/search/events?q=джаз").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events", hasSize(greaterThan(0))))
            .andExpect(jsonPath("$.events[0].venue.id", notNullValue()))
            .andExpect(jsonPath("$.events[0].friends_interested", hasSize(0)))
            .andExpect(jsonPath("$.events[0].friends_plan_count").value(0));
    }

    @Test
    void discoveryNotFoundAndInvalidUuidErrorsMatchFastifyEnvelope() throws Exception {
        String token = login();

        mockMvc.perform(get("/api/users/not-a-uuid").header("Authorization", "Bearer " + token))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
            .andExpect(jsonPath("$.message").value("id must be a valid uuid"));

        mockMvc.perform(get("/api/events/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Event not found"));

        mockMvc.perform(get("/api/venues/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Venue not found"));
    }

    @Test
    void profilePatchMatchesFastifyValidationAndResponseShape() throws Exception {
        String token = login();
        String username = "profile_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);

        mockMvc.perform(patch("/api/users/me")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Updated User\",\"username\":\"" + username + "\",\"avatar_url\":null}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.user.name").value("Updated User"))
            .andExpect(jsonPath("$.user.username").value(username))
            .andExpect(jsonPath("$.user.phone").value("+79990000000"));

        mockMvc.perform(patch("/api/users/me")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.user.username").value(username));

        mockMvc.perform(patch("/api/users/me")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
            .andExpect(jsonPath("$.message").value("name must be 1-100 chars"));

        mockMvc.perform(patch("/api/users/me")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"has spaces\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
            .andExpect(jsonPath("$.message").value("username must be 1-50 alphanumeric/underscore chars"));

        mockMvc.perform(patch("/api/users/me")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"avatar_url\":123}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
            .andExpect(jsonPath("$.message").value("avatar_url must be null or string <= 500 chars"));

        mockMvc.perform(patch("/api/users/me")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"masha\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("USERNAME_TAKEN"))
            .andExpect(jsonPath("$.message").value("Username already taken"));
    }

    @Test
    void friendWriteFlowMatchesFastifyStatusesAndShapes() throws Exception {
        LoginResult userA = loginAs(uniquePhone());
        LoginResult userB = loginAs(uniquePhone());

        mockMvc.perform(post("/api/users/friends/" + userB.userId())
                .header("Authorization", "Bearer " + userA.token()))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.friendship.status").value("pending"))
            .andExpect(jsonPath("$.friendship.requester_id").value(userA.userId()))
            .andExpect(jsonPath("$.friendship.addressee_id").value(userB.userId()));

        mockMvc.perform(post("/api/users/friends/" + userB.userId())
                .header("Authorization", "Bearer " + userA.token()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("REQUEST_ALREADY_SENT"))
            .andExpect(jsonPath("$.friendship.status").value("pending"));

        mockMvc.perform(patch("/api/users/friends/" + userA.userId() + "?action=accept")
                .header("Authorization", "Bearer " + userB.token()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.friendship.status").value("accepted"));

        mockMvc.perform(post("/api/users/friends/" + userB.userId())
                .header("Authorization", "Bearer " + userA.token()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ALREADY_FRIENDS"))
            .andExpect(jsonPath("$.friendship.status").value("accepted"));

        mockMvc.perform(delete("/api/users/friends/" + userB.userId())
                .header("Authorization", "Bearer " + userA.token()))
            .andExpect(status().isNoContent());

        Integer friendshipCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM friendships WHERE (requester_id = ?::uuid AND addressee_id = ?::uuid) OR (requester_id = ?::uuid AND addressee_id = ?::uuid)",
            Integer.class,
            userA.userId(),
            userB.userId(),
            userB.userId(),
            userA.userId()
        );
        assertThat(friendshipCount).isZero();
    }

    @Test
    void newFriendRequestCreatesFriendRequestNotification() throws Exception {
        LoginResult requester = loginAs(uniquePhone());
        LoginResult addressee = loginAs(uniquePhone());

        mockMvc.perform(post("/api/users/friends/" + addressee.userId())
                .header("Authorization", "Bearer " + requester.token()))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.friendship.status").value("pending"));

        String friendshipId = friendshipId(requester.userId(), addressee.userId());
        assertThat(notificationCount(addressee.userId(), "friend_request")).isOne();
        assertThat(notificationPayloadValue(addressee.userId(), "friend_request", "friendship_id")).isEqualTo(friendshipId);
        assertThat(notificationPayloadValue(addressee.userId(), "friend_request", "requester_id")).isEqualTo(requester.userId());
        assertThat(notificationPayloadValue(addressee.userId(), "friend_request", "requester_name")).isEqualTo(userValue(requester.userId(), "name"));
        assertThat(notificationPayloadValue(addressee.userId(), "friend_request", "requester_username")).isEqualTo(userValue(requester.userId(), "username"));
    }

    @Test
    void duplicateFriendRequestDoesNotCreateExtraNotification() throws Exception {
        LoginResult requester = loginAs(uniquePhone());
        LoginResult addressee = loginAs(uniquePhone());

        mockMvc.perform(post("/api/users/friends/" + addressee.userId())
                .header("Authorization", "Bearer " + requester.token()))
            .andExpect(status().isCreated());
        assertThat(notificationCount(addressee.userId(), "friend_request")).isOne();

        mockMvc.perform(post("/api/users/friends/" + addressee.userId())
                .header("Authorization", "Bearer " + requester.token()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("REQUEST_ALREADY_SENT"));
        assertThat(notificationCount(addressee.userId(), "friend_request")).isOne();
    }

    @Test
    void reversePendingAutoAcceptCreatesFriendAcceptedNotification() throws Exception {
        LoginResult requester = loginAs(uniquePhone());
        LoginResult accepter = loginAs(uniquePhone());

        mockMvc.perform(post("/api/users/friends/" + accepter.userId())
                .header("Authorization", "Bearer " + requester.token()))
            .andExpect(status().isCreated());
        String friendshipId = friendshipId(requester.userId(), accepter.userId());

        mockMvc.perform(post("/api/users/friends/" + requester.userId())
                .header("Authorization", "Bearer " + accepter.token()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.friendship.status").value("accepted"));

        assertThat(notificationCount(requester.userId(), "friend_accepted")).isOne();
        assertThat(notificationPayloadValue(requester.userId(), "friend_accepted", "friendship_id")).isEqualTo(friendshipId);
        assertThat(notificationPayloadValue(requester.userId(), "friend_accepted", "accepter_id")).isEqualTo(accepter.userId());
        assertThat(notificationPayloadValue(requester.userId(), "friend_accepted", "accepter_name")).isEqualTo(userValue(accepter.userId(), "name"));
        assertThat(notificationPayloadValue(requester.userId(), "friend_accepted", "accepter_username")).isEqualTo(userValue(accepter.userId(), "username"));
    }

    @Test
    void explicitAcceptCreatesFriendAcceptedNotification() throws Exception {
        LoginResult requester = loginAs(uniquePhone());
        LoginResult accepter = loginAs(uniquePhone());

        mockMvc.perform(post("/api/users/friends/" + accepter.userId())
                .header("Authorization", "Bearer " + requester.token()))
            .andExpect(status().isCreated());
        String friendshipId = friendshipId(requester.userId(), accepter.userId());

        mockMvc.perform(patch("/api/users/friends/" + requester.userId() + "?action=accept")
                .header("Authorization", "Bearer " + accepter.token()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.friendship.status").value("accepted"));

        assertThat(notificationCount(requester.userId(), "friend_accepted")).isOne();
        assertThat(notificationPayloadValue(requester.userId(), "friend_accepted", "friendship_id")).isEqualTo(friendshipId);
        assertThat(notificationPayloadValue(requester.userId(), "friend_accepted", "accepter_id")).isEqualTo(accepter.userId());
        assertThat(notificationPayloadValue(requester.userId(), "friend_accepted", "accepter_name")).isEqualTo(userValue(accepter.userId(), "name"));
        assertThat(notificationPayloadValue(requester.userId(), "friend_accepted", "accepter_username")).isEqualTo(userValue(accepter.userId(), "username"));
    }

    @Test
    void declineAndDeleteDoNotCreateUnexpectedNotifications() throws Exception {
        LoginResult requester = loginAs(uniquePhone());
        LoginResult addressee = loginAs(uniquePhone());

        mockMvc.perform(post("/api/users/friends/" + addressee.userId())
                .header("Authorization", "Bearer " + requester.token()))
            .andExpect(status().isCreated());
        assertThat(notificationCount(addressee.userId(), "friend_request")).isOne();
        assertThat(notificationCount(requester.userId(), "friend_accepted")).isZero();

        mockMvc.perform(patch("/api/users/friends/" + requester.userId() + "?action=decline")
                .header("Authorization", "Bearer " + addressee.token()))
            .andExpect(status().isNoContent());
        assertThat(notificationCount(addressee.userId(), "friend_request")).isOne();
        assertThat(notificationCount(requester.userId(), "friend_accepted")).isZero();

        LoginResult deleter = loginAs(uniquePhone());
        LoginResult target = loginAs(uniquePhone());
        mockMvc.perform(post("/api/users/friends/" + target.userId())
                .header("Authorization", "Bearer " + deleter.token()))
            .andExpect(status().isCreated());
        int targetFriendRequests = notificationCount(target.userId(), "friend_request");
        int deleterFriendAccepted = notificationCount(deleter.userId(), "friend_accepted");

        mockMvc.perform(delete("/api/users/friends/" + target.userId())
                .header("Authorization", "Bearer " + deleter.token()))
            .andExpect(status().isNoContent());
        assertThat(notificationCount(target.userId(), "friend_request")).isEqualTo(targetFriendRequests);
        assertThat(notificationCount(deleter.userId(), "friend_accepted")).isEqualTo(deleterFriendAccepted);
    }

    @Test
    void friendWriteErrorsUseFastifyEnvelope() throws Exception {
        String token = login();
        String unknownUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

        mockMvc.perform(post("/api/users/friends/not-a-uuid").header("Authorization", "Bearer " + token))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
            .andExpect(jsonPath("$.message").value("id must be a valid uuid"));

        mockMvc.perform(post("/api/users/friends/" + unknownUserId).header("Authorization", "Bearer " + token))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("User not found"));

        mockMvc.perform(patch("/api/users/friends/" + unknownUserId + "?action=accept")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("No pending request from this user"));

        mockMvc.perform(delete("/api/users/friends/not-a-uuid").header("Authorization", "Bearer " + token))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
            .andExpect(jsonPath("$.message").value("id must be a valid uuid"));

        mockMvc.perform(patch("/api/users/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"No Auth\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void eventInterestAndSaveWritesMatchFastifyBehavior() throws Exception {
        String token = login();
        String eventId = "61111111-1111-4111-8111-111111111111";

        mockMvc.perform(post("/api/events/" + eventId + "/interest").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(post("/api/events/" + eventId + "/interest").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
        assertThat(countRows("event_interests", eventId)).isOne();

        mockMvc.perform(get("/api/events/" + eventId).header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.event.id").value(eventId));

        mockMvc.perform(delete("/api/events/" + eventId + "/interest").header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent());
        assertThat(countRows("event_interests", eventId)).isZero();

        mockMvc.perform(post("/api/events/" + eventId + "/save").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(post("/api/events/" + eventId + "/save").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
        assertThat(countRows("saved_events", eventId)).isOne();

        mockMvc.perform(delete("/api/events/" + eventId + "/save").header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent());
        assertThat(countRows("saved_events", eventId)).isZero();
    }

    @Test
    void eventWriteErrorsUseFastifyEnvelope() throws Exception {
        String token = login();
        String unknownEventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

        mockMvc.perform(post("/api/events/" + unknownEventId + "/interest").header("Authorization", "Bearer " + token))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Event not found"));

        mockMvc.perform(post("/api/events/" + unknownEventId + "/save").header("Authorization", "Bearer " + token))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Event not found"));

        mockMvc.perform(post("/api/events/61111111-1111-4111-8111-111111111111/interest"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
            .andExpect(jsonPath("$.message").value("Unauthorized"));
    }

    private String login() throws Exception {
        mockMvc.perform(post("/api/auth/otp/send")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"+79990000000\"}"))
            .andExpect(status().isOk());

        String verifyJson = mockMvc.perform(post("/api/auth/otp/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"+79990000000\",\"code\":\"1111\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return JsonField.readString(verifyJson, "access_token");
    }

    private LoginResult loginAs(String phone) throws Exception {
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
        String userId = jdbc.queryForObject("SELECT id::text FROM users WHERE phone = ?", String.class, phone);
        return new LoginResult(JsonField.readString(verifyJson, "access_token"), userId);
    }

    private String uniquePhone() {
        String digits = UUID.randomUUID().toString().replaceAll("\\D", "") + "0000000";
        return "+7988" + digits.substring(0, 7);
    }

    private String friendshipId(String requesterId, String addresseeId) {
        return jdbc.queryForObject(
            "SELECT id::text FROM friendships WHERE requester_id = ?::uuid AND addressee_id = ?::uuid",
            String.class,
            requesterId,
            addresseeId
        );
    }

    private String userValue(String userId, String column) {
        return jdbc.queryForObject("SELECT " + column + " FROM users WHERE id = ?::uuid", String.class, userId);
    }

    private int notificationCount(String userId, String type) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ?::uuid AND type = CAST(? AS notification_type)",
            Integer.class,
            userId,
            type
        );
        return count;
    }

    private String notificationPayloadValue(String userId, String type, String key) {
        return jdbc.queryForObject(
            "SELECT jsonb_extract_path_text(payload, ?) FROM notifications WHERE user_id = ?::uuid AND type = CAST(? AS notification_type) ORDER BY created_at DESC LIMIT 1",
            String.class,
            key,
            userId,
            type
        );
    }

    private int countRows(String table, String eventId) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM " + table + " WHERE user_id = (SELECT id FROM users WHERE phone = '+79990000000') AND event_id = ?::uuid",
            Integer.class,
            eventId
        );
        return count;
    }

    private record LoginResult(String token, String userId) {
    }

    private void register(String phone) throws Exception {
        mockMvc.perform(post("/api/auth/otp/send")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\"}"))
            .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/otp/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\",\"code\":\"1111\"}"))
            .andExpect(status().isOk());
    }
}
