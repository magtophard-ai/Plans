package com.plans.backend.api.parity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plans.backend.persistence.DevSeedRunner;
import java.util.List;
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
