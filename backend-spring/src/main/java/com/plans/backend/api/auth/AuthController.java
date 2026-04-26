package com.plans.backend.api.auth;

import com.plans.backend.api.error.ApiException;
import com.plans.backend.auth.JwtService;
import com.plans.backend.auth.NotRefreshTokenException;
import com.plans.backend.auth.OtpService;
import com.plans.backend.auth.PhoneNormalizer;
import com.plans.backend.auth.VerifyOtpResult;
import com.plans.backend.persistence.SqlRows;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final JdbcClient jdbc;
    private final OtpService otpService;
    private final JwtService jwtService;

    public AuthController(JdbcClient jdbc, OtpService otpService, JwtService jwtService) {
        this.jdbc = jdbc;
        this.otpService = otpService;
        this.jwtService = jwtService;
    }

    @PostMapping("/otp/send")
    Map<String, Object> sendOtp(@RequestBody OtpSendRequest request) {
        String phone = PhoneNormalizer.normalizeRuPhone(request.phone())
            .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PHONE", "Invalid phone number"));
        otpService.send(phone);
        return Map.of();
    }

    @PostMapping("/otp/verify")
    Map<String, Object> verifyOtp(@RequestBody OtpVerifyRequest request) {
        String phone = PhoneNormalizer.normalizeRuPhone(request.phone()).orElse(null);
        if (phone == null || request.code() == null || request.code().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "phone and code required");
        }
        VerifyOtpResult result = otpService.verify(phone, request.code());
        if (result == VerifyOtpResult.LOCKED) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "OTP_LOCKED", "Too many invalid attempts, request a new code");
        }
        if (result != VerifyOtpResult.OK) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_OTP", "Invalid or expired OTP");
        }

        Map<String, Object> user = findUserByPhone(phone);
        if (user == null) {
            user = createUser(phone);
        }
        String userId = (String) user.get("id");
        return Map.of(
            "access_token", jwtService.accessToken(java.util.UUID.fromString(userId)),
            "refresh_token", jwtService.refreshToken(java.util.UUID.fromString(userId)),
            "user", user
        );
    }

    @PostMapping("/refresh")
    Map<String, String> refresh(@RequestBody RefreshRequest request) {
        if (request.refreshToken() == null || request.refreshToken().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "refresh_token required");
        }
        try {
            var userId = jwtService.verifyRefresh(request.refreshToken());
            return Map.of(
                "access_token", jwtService.accessToken(userId),
                "refresh_token", jwtService.refreshToken(userId)
            );
        } catch (NotRefreshTokenException exception) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Not a refresh token");
        } catch (RuntimeException exception) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Invalid refresh token");
        }
    }

    @GetMapping("/me")
    Map<String, Object> me(AuthenticatedUser authenticatedUser) {
        Map<String, Object> user = findUserById(authenticatedUser.id());
        if (user == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "User not found");
        }
        return Map.of("user", user);
    }

    private Map<String, Object> findUserByPhone(String phone) {
        List<Map<String, Object>> users = jdbc.sql("SELECT * FROM users WHERE phone = :phone")
            .param("phone", phone)
            .query()
            .listOfRows();
        return users.stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElse(null);
    }

    private Map<String, Object> findUserById(java.util.UUID id) {
        List<Map<String, Object>> users = jdbc.sql("SELECT * FROM users WHERE id = :id")
            .param("id", id)
            .query()
            .listOfRows();
        return users.stream()
            .findFirst()
            .map(SqlRows::normalize)
            .orElse(null);
    }

    private Map<String, Object> createUser(String phone) {
        Map<String, Object> user = jdbc.sql(
                """
                INSERT INTO users (phone, name, username)
                VALUES (:phone, :name, :username)
                RETURNING *
                """
            )
            .param("phone", phone)
            .param("name", "Пользователь")
            .param("username", "user_" + phone.substring(phone.length() - 4))
            .query()
            .singleRow();
        return SqlRows.normalize(user);
    }

    public record OtpSendRequest(String phone) {
    }

    public record OtpVerifyRequest(String phone, String code) {
    }

    public record RefreshRequest(String refreshToken) {
    }
}
