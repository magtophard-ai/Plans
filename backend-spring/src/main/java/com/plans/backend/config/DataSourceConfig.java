package com.plans.backend.config;

import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class DataSourceConfig {
    @Bean
    public DataSource dataSource(Environment environment) {
        String rawUrl = firstPresent(
            environment.getProperty("DATABASE_URL"),
            environment.getProperty("spring.datasource.url"),
            "jdbc:postgresql://localhost:5432/plans"
        );
        String username = firstPresent(
            environment.getProperty("DATABASE_USERNAME"),
            environment.getProperty("spring.datasource.username"),
            "postgres"
        );
        String password = firstPresent(
            environment.getProperty("DATABASE_PASSWORD"),
            environment.getProperty("spring.datasource.password"),
            "postgres"
        );

        PostgresConnection connection = normalize(rawUrl, username, password);
        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setJdbcUrl(connection.jdbcUrl());
        dataSource.setUsername(connection.username());
        dataSource.setPassword(connection.password());
        return dataSource;
    }

    private static PostgresConnection normalize(String rawUrl, String username, String password) {
        if (rawUrl.startsWith("jdbc:postgresql:")) {
            return new PostgresConnection(rawUrl, username, password);
        }

        URI uri = URI.create(rawUrl);
        if (!"postgres".equals(uri.getScheme()) && !"postgresql".equals(uri.getScheme())) {
            throw new IllegalArgumentException("Unsupported database URL scheme: " + uri.getScheme());
        }

        String query = uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery();
        String jdbcUrl = "jdbc:postgresql://" + uri.getHost() + ":" + uri.getPort() + uri.getRawPath() + query;
        String userInfo = uri.getUserInfo();
        if (userInfo == null || userInfo.isBlank()) {
            return new PostgresConnection(jdbcUrl, username, password);
        }

        String[] parts = userInfo.split(":", 2);
        String parsedUsername = parts[0];
        String parsedPassword = parts.length > 1 ? parts[1] : password;
        return new PostgresConnection(jdbcUrl, parsedUsername, parsedPassword);
    }

    private static String firstPresent(String first, String second, String fallback) {
        if (first != null && !first.isBlank()) {
            return first;
        }
        if (second != null && !second.isBlank()) {
            return second;
        }
        return fallback;
    }

    private record PostgresConnection(String jdbcUrl, String username, String password) {}
}
