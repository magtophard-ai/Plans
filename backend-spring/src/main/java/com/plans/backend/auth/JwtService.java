package com.plans.backend.auth;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
    private static final Base64.Encoder BASE64_URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder BASE64_URL_DECODER = Base64.getUrlDecoder();

    private final byte[] secret;
    private final ObjectMapper objectMapper;

    public JwtService(@Value("${JWT_SECRET:dev-secret}") String jwtSecret, ObjectMapper objectMapper) {
        this.secret = jwtSecret.getBytes(StandardCharsets.UTF_8);
        this.objectMapper = objectMapper;
    }

    public String accessToken(UUID userId) {
        return token(userId, null, 60 * 60);
    }

    public String refreshToken(UUID userId) {
        return token(userId, "refresh", 30L * 24 * 60 * 60);
    }

    public UUID verifyAccess(String token) {
        return verify(token, false);
    }

    public UUID verifyRefresh(String token) {
        return verify(token, true);
    }

    private String token(UUID userId, String type, long ttlSeconds) {
        long now = Instant.now().getEpochSecond();
        var header = new LinkedHashMap<String, Object>();
        header.put("alg", "HS256");
        header.put("typ", "JWT");
        var claims = new LinkedHashMap<String, Object>();
        claims.put("userId", userId.toString());
        if (type != null) {
            claims.put("type", type);
        }
        claims.put("iat", now);
        claims.put("exp", now + ttlSeconds);
        String unsigned = encodeJson(header) + "." + encodeJson(claims);
        return unsigned + "." + sign(unsigned);
    }

    private UUID verify(String token, boolean refresh) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3 || !MessageDigest.isEqual(sign(parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8), parts[2].getBytes(StandardCharsets.UTF_8))) {
                throw new InvalidJwtException();
            }
            var claims = objectMapper.readTree(BASE64_URL_DECODER.decode(parts[1]));
            if (claims.path("exp").asLong() < Instant.now().getEpochSecond()) {
                throw new InvalidJwtException();
            }
            if (refresh && !"refresh".equals(claims.path("type").asText(null))) {
                throw new NotRefreshTokenException();
            }
            return UUID.fromString(claims.path("userId").asText());
        } catch (NotRefreshTokenException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new InvalidJwtException();
        }
    }

    private String encodeJson(Object value) {
        try {
            return BASE64_URL_ENCODER.encodeToString(objectMapper.writeValueAsBytes(value));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize JWT", exception);
        }
    }

    private String sign(String unsignedToken) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return BASE64_URL_ENCODER.encodeToString(mac.doFinal(unsignedToken.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to sign JWT", exception);
        }
    }
}
