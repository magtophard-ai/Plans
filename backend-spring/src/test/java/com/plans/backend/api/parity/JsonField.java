package com.plans.backend.api.parity;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;

final class JsonField {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonField() {
    }

    static String readString(String json, String field) {
        try {
            return MAPPER.readTree(json).get(field).asText();
        } catch (IOException exception) {
            throw new IllegalArgumentException("Invalid JSON response", exception);
        }
    }
}
