package com.plans.backend.auth;

import java.util.Optional;

public final class PhoneNormalizer {
    private PhoneNormalizer() {
    }

    public static Optional<String> normalizeRuPhone(String input) {
        if (input == null) {
            return Optional.empty();
        }
        String digits = input.replaceAll("\\D", "");
        if (digits.length() < 10) {
            return Optional.empty();
        }
        String normalized = digits;
        if (normalized.length() == 10) {
            normalized = "7" + normalized;
        }
        if (normalized.length() == 11 && normalized.startsWith("8")) {
            normalized = "7" + normalized.substring(1);
        }
        if (normalized.length() != 11 || !normalized.startsWith("7")) {
            return Optional.empty();
        }
        return Optional.of("+" + normalized);
    }
}
