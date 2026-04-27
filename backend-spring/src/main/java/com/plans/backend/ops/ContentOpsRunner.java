package com.plans.backend.ops;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plans.backend.content.ContentOpsService;
import com.plans.backend.content.ContentOpsService.PublishOptions;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.SequencedMap;
import java.util.UUID;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

@Component
public class ContentOpsRunner implements ApplicationRunner {
    private final ContentOpsService contentOpsService;
    private final ObjectMapper objectMapper;
    private final ApplicationContext applicationContext;

    public ContentOpsRunner(
        ContentOpsService contentOpsService,
        ObjectMapper objectMapper,
        ApplicationContext applicationContext
    ) {
        this.contentOpsService = contentOpsService;
        this.objectMapper = objectMapper;
        this.applicationContext = applicationContext;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        ParsedArgs parsedArgs = parse(args.getSourceArgs());
        if (parsedArgs.command() == null) {
            return;
        }
        int exitCode = 0;
        try {
            print(runCommand(parsedArgs));
        } catch (Exception exception) {
            exitCode = 1;
            System.err.println(exception.getMessage());
        } finally {
            int finalExitCode = exitCode;
            SpringApplication.exit(applicationContext, () -> finalExitCode);
        }
    }

    private Object runCommand(ParsedArgs args) {
        return switch (args.command()) {
            case "import" -> {
                Object payload = payloadFromFile(args);
                yield Map.of("ingestion", contentOpsService.importNormalizedEvent(payload));
            }
            case "list" -> Map.of("ingestions", contentOpsService.listIngestions(args.optional("state")));
            case "show" -> Map.of("ingestion", contentOpsService.getIngestionById(uuid(args.option("ingestion-id"))));
            case "publish" -> contentOpsService.publishIngestion(
                uuid(args.option("ingestion-id")),
                new PublishOptions(args.optionalUuid("venue-id"), args.optionalUuid("force-link-event-id"))
            );
            case "update" -> contentOpsService.updateFromIngestion(uuid(args.option("ingestion-id")));
            case "sync" -> {
                Object payload = payloadFromFile(args);
                yield contentOpsService.syncNormalizedEvent(payload);
            }
            case "cancel" -> contentOpsService.cancelEventById(uuid(args.option("event-id")), args.option("reason"));
            default -> throw new IllegalArgumentException(
                "Usage: --content-ops=<import|list|show|publish|update|sync|cancel> [--args]"
            );
        };
    }

    private ParsedArgs parse(String[] sourceArgs) {
        String command = null;
        SequencedMap<String, String> options = new LinkedHashMap<>();
        for (int i = 0; i < sourceArgs.length; i++) {
            String arg = sourceArgs[i];
            if (!arg.startsWith("--")) {
                if (command == null) {
                    command = arg;
                }
                continue;
            }
            String raw = arg.substring(2);
            String key;
            String value;
            int equals = raw.indexOf('=');
            if (equals >= 0) {
                key = raw.substring(0, equals);
                value = raw.substring(equals + 1);
            } else {
                key = raw;
                String next = i + 1 < sourceArgs.length ? sourceArgs[i + 1] : null;
                if (next != null && !next.startsWith("--")) {
                    value = next;
                    i++;
                } else {
                    value = "";
                }
            }
            if ("content-ops".equals(key)) {
                command = value;
            } else {
                options.put(key, value);
            }
        }
        return new ParsedArgs(command, options);
    }

    private Object payloadFromFile(ParsedArgs args) {
        Map<String, Object> file = contentOpsService.readNormalizedEventFile(Path.of(args.option("file")));
        JsonNode raw = (JsonNode) file.get("raw");
        String sourceUrl = args.optional("source-url");
        if (sourceUrl == null) {
            return raw;
        }
        Map<String, Object> payload = objectMapper.convertValue(
            raw,
            objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class)
        );
        payload.put("source_url", sourceUrl);
        return payload;
    }

    private void print(Object value) throws Exception {
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value));
    }

    private UUID uuid(String value) {
        return UUID.fromString(value);
    }

    private record ParsedArgs(String command, Map<String, String> options) {
        String option(String name) {
            String value = optional(name);
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException("--" + name + " is required");
            }
            return value;
        }

        String optional(String name) {
            String value = options.get(name);
            return value == null || value.isBlank() ? null : value;
        }

        UUID optionalUuid(String name) {
            String value = optional(name);
            return value == null ? null : UUID.fromString(value);
        }
    }
}
