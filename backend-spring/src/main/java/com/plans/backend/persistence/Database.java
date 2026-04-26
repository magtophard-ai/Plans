package com.plans.backend.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class Database {
    private final JdbcTemplate jdbc;

    public Database(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public int count(DatabaseTable table) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table.tableName(), Integer.class);
        if (count == null) {
            throw new IllegalStateException("Count query returned null for " + table.tableName());
        }
        return count;
    }

    public JdbcTemplate jdbc() {
        return jdbc;
    }
}
