package com.plans.backend.auth;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class OtpService {
    private static final int MAX_ATTEMPTS = 5;

    private final String code;
    private final Clock clock;
    private final Map<String, OtpEntry> otpStore = new ConcurrentHashMap<>();

    @Autowired
    public OtpService(@Value("${OTP_CODE:1111}") String code) {
        this(code, Clock.systemUTC());
    }

    OtpService(String code, Clock clock) {
        this.code = code;
        this.clock = clock;
    }

    public void send(String phone) {
        otpStore.put(phone, new OtpEntry(code, Instant.now(clock).plus(5, ChronoUnit.MINUTES), 0));
    }

    public VerifyOtpResult verify(String phone, String submittedCode) {
        OtpEntry entry = otpStore.get(phone);
        if (entry == null) {
            return VerifyOtpResult.NOT_FOUND;
        }
        if (Instant.now(clock).isAfter(entry.expiresAt())) {
            otpStore.remove(phone);
            return VerifyOtpResult.EXPIRED;
        }
        if (entry.attempts() >= MAX_ATTEMPTS) {
            otpStore.remove(phone);
            return VerifyOtpResult.LOCKED;
        }
        if (!entry.code().equals(submittedCode)) {
            OtpEntry updated = new OtpEntry(entry.code(), entry.expiresAt(), entry.attempts() + 1);
            if (updated.attempts() >= MAX_ATTEMPTS) {
                otpStore.remove(phone);
                return VerifyOtpResult.LOCKED;
            }
            otpStore.put(phone, updated);
            return VerifyOtpResult.INVALID;
        }
        otpStore.remove(phone);
        return VerifyOtpResult.OK;
    }

    private record OtpEntry(String code, Instant expiresAt, int attempts) {
    }
}
