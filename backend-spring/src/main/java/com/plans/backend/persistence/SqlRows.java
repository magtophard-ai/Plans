package com.plans.backend.persistence;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public final class SqlRows {
    private SqlRows() {
    }

    public static Map<String, Object> normalize(Map<String, Object> row) {
        Map<String, Object> normalized = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            normalized.put(entry.getKey(), normalizeValue(entry.getValue()));
        }
        return normalized;
    }

    private static Object normalizeValue(Object value) {
        if (value instanceof Timestamp timestamp) {
            return OffsetDateTime.ofInstant(timestamp.toInstant(), ZoneOffset.UTC);
        }
        if (value instanceof BigDecimal decimal) {
            return decimal.doubleValue();
        }
        if (value instanceof Array array) {
            try {
                Object arrayValue = array.getArray();
                if (arrayValue instanceof Object[] values) {
                    return Arrays.asList(values);
                }
            } catch (Exception exception) {
                throw new IllegalStateException("Failed to read SQL array", exception);
            }
        }
        if (value instanceof UUID) {
            return value.toString();
        }
        return value;
    }
}
