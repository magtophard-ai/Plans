package com.plans.backend.db;

import static org.assertj.core.api.Assertions.assertThat;
import static com.plans.backend.persistence.DatabaseTable.EVENTS;
import static com.plans.backend.persistence.DatabaseTable.EVENT_INTERESTS;
import static com.plans.backend.persistence.DatabaseTable.FRIENDSHIPS;
import static com.plans.backend.persistence.DatabaseTable.GROUPS;
import static com.plans.backend.persistence.DatabaseTable.GROUP_MEMBERS;
import static com.plans.backend.persistence.DatabaseTable.INVITATIONS;
import static com.plans.backend.persistence.DatabaseTable.MESSAGES;
import static com.plans.backend.persistence.DatabaseTable.NOTIFICATIONS;
import static com.plans.backend.persistence.DatabaseTable.PLANS;
import static com.plans.backend.persistence.DatabaseTable.PLAN_PARTICIPANTS;
import static com.plans.backend.persistence.DatabaseTable.PLAN_PROPOSALS;
import static com.plans.backend.persistence.DatabaseTable.USERS;
import static com.plans.backend.persistence.DatabaseTable.VENUES;
import static com.plans.backend.persistence.DatabaseTable.VOTES;

import com.plans.backend.persistence.Database;
import com.plans.backend.persistence.DevSeedRunner;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
class DatabaseMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
    }

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private Database database;

    @Autowired
    private DevSeedRunner devSeedRunner;

    @Autowired
    private Flyway flyway;

    @Test
    void flywayCreatesBaselineAndAdditiveSchema() {
        assertThat(database.count(USERS)).isZero();
        assertThat(tableExists("event_ingestions")).isTrue();
        assertThat(columnExists("messages", "client_message_id")).isTrue();
        assertThat(columnExists("events", "status")).isTrue();
        assertThat(columnExists("events", "source_fingerprint")).isTrue();
        assertThat(indexExists("idx_plans_share_token_unique")).isTrue();
        assertThat(notificationTypeExists("plan_join_via_link")).isTrue();
        assertThat(plansWithoutShareToken()).isZero();
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("2");
    }

    @Test
    void devSeedMatchesFastifySeedCountsAndIsIdempotent() {
        devSeedRunner.run();
        devSeedRunner.run();

        assertThat(database.count(USERS)).isEqualTo(6);
        assertThat(database.count(FRIENDSHIPS)).isEqualTo(7);
        assertThat(database.count(VENUES)).isEqualTo(5);
        assertThat(database.count(EVENTS)).isEqualTo(6);
        assertThat(database.count(EVENT_INTERESTS)).isEqualTo(7);
        assertThat(database.count(PLANS)).isEqualTo(3);
        assertThat(database.count(PLAN_PARTICIPANTS)).isEqualTo(9);
        assertThat(database.count(PLAN_PROPOSALS)).isEqualTo(2);
        assertThat(database.count(VOTES)).isEqualTo(2);
        assertThat(database.count(MESSAGES)).isEqualTo(3);
        assertThat(database.count(GROUPS)).isEqualTo(2);
        assertThat(database.count(GROUP_MEMBERS)).isEqualTo(7);
        assertThat(database.count(INVITATIONS)).isEqualTo(1);
        assertThat(database.count(NOTIFICATIONS)).isEqualTo(2);
    }

    private boolean tableExists(String tableName) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?",
            Integer.class,
            tableName
        );
        return count != null && count > 0;
    }

    private boolean columnExists(String tableName, String columnName) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = ?",
            Integer.class,
            tableName,
            columnName
        );
        return count != null && count > 0;
    }

    private boolean indexExists(String indexName) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = ?",
            Integer.class,
            indexName
        );
        return count != null && count > 0;
    }

    private boolean notificationTypeExists(String value) {
        Integer count = jdbc.queryForObject(
            """
            SELECT COUNT(*)
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'notification_type' AND e.enumlabel = ?
            """,
            Integer.class,
            value
        );
        return count != null && count > 0;
    }

    private int plansWithoutShareToken() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM plans WHERE share_token IS NULL", Integer.class);
        return count == null ? 0 : count;
    }
}
