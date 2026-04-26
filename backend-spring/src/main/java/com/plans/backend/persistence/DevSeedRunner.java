package com.plans.backend.persistence;

import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

@Component
public class DevSeedRunner {
    private final JdbcTemplate jdbc;

    public DevSeedRunner(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void run() {
        var populator = new ResourceDatabasePopulator(new ClassPathResource("db/seed/R__dev_seed.sql"));
        var dataSource = jdbc.getDataSource();
        if (dataSource == null) {
            throw new IllegalStateException("DataSource is not configured");
        }
        populator.execute(dataSource);
    }
}
