package com.plans.backend.api.realtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plans.backend.auth.InvalidJwtException;
import com.plans.backend.auth.JwtService;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class RealtimeWebSocketHandler extends TextWebSocketHandler implements DisposableBean {
    private final Map<String, ClientConnection> connections = new ConcurrentHashMap<>();
    private final ScheduledExecutorService heartbeatExecutor = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "realtime-ws-heartbeat");
        thread.setDaemon(true);
        return thread;
    });
    private final JwtService jwtService;
    private final JdbcClient jdbc;
    private final ObjectMapper objectMapper;

    public RealtimeWebSocketHandler(JwtService jwtService, JdbcClient jdbc, ObjectMapper objectMapper) {
        this.jwtService = jwtService;
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode json;
        try {
            json = objectMapper.readTree(message.getPayload());
        } catch (JsonProcessingException exception) {
            return;
        }

        String type = json.path("type").asText(null);
        if ("auth".equals(type)) {
            authenticate(session, json.path("token").asText(null));
            return;
        }
        if ("pong".equals(type)) {
            ClientConnection connection = connections.get(session.getId());
            if (connection != null) {
                connection.lastPong().set(System.currentTimeMillis());
                connection.pingOutstanding().set(false);
            }
            return;
        }

        ClientConnection connection = connections.get(session.getId());
        if (connection == null) {
            send(session, Map.of("type", "error", "message", "Not authenticated"));
            return;
        }

        if ("subscribe".equals(type) && json.path("channel").isTextual()) {
            subscribe(session, connection, json.path("channel").asText());
            return;
        }
        if ("unsubscribe".equals(type) && json.path("channel").isTextual()) {
            String channel = json.path("channel").asText();
            connection.channels().remove(channel);
            send(session, Map.of("type", "unsubscribed", "channel", channel));
            return;
        }
        send(session, Map.of("type", "error", "message", "Unknown message type"));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        removeConnection(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        removeConnection(session);
    }

    @Override
    public void destroy() {
        heartbeatExecutor.shutdownNow();
    }

    public void emit(String channel, String event, Map<String, Object> payload) {
        Map<String, Object> message = Map.of(
            "type", "event",
            "channel", channel,
            "event", event,
            "payload", payload
        );
        connections.values().stream()
            .filter(connection -> connection.channels().contains(channel))
            .forEach(connection -> send(connection.session(), message));
    }

    private void authenticate(WebSocketSession session, String token) throws IOException {
        try {
            UUID userId = jwtService.verifyAccess(token);
            Set<String> channels = ConcurrentHashMap.newKeySet();
            channels.add("user:" + userId);
            removeConnection(session);
            ClientConnection connection = new ClientConnection(userId, session, channels);
            connection.scheduleHeartbeat(heartbeatExecutor.scheduleAtFixedRate(
                () -> heartbeat(connection),
                30,
                30,
                TimeUnit.SECONDS
            ));
            connections.put(session.getId(), connection);
            send(session, Map.of("type", "auth_ok", "userId", userId.toString()));
        } catch (InvalidJwtException exception) {
            send(session, Map.of("type", "auth_error", "message", "Invalid token"));
            session.close();
        }
    }

    private void subscribe(WebSocketSession session, ClientConnection connection, String channel) {
        if (channel.startsWith("plan:")) {
            String planId = channel.substring("plan:".length());
            if (!isUuid(planId)) {
                send(session, Map.of("type", "error", "message", "Invalid plan id"));
                return;
            }
            if (!canSubscribePlan(connection.userId(), UUID.fromString(planId))) {
                send(session, Map.of("type", "error", "message", "Not a participant of this plan"));
                return;
            }
        } else if (!channel.equals("user:" + connection.userId())) {
            send(session, Map.of("type", "error", "message", "Cannot subscribe to this channel"));
            return;
        }
        connection.channels().add(channel);
        send(session, Map.of("type", "subscribed", "channel", channel));
    }

    private boolean canSubscribePlan(UUID userId, UUID planId) {
        return jdbc.sql("SELECT 1 FROM plan_participants WHERE plan_id = :planId AND user_id = :userId")
            .param("planId", planId)
            .param("userId", userId)
            .query()
            .listOfRows()
            .stream()
            .findFirst()
            .isPresent();
    }

    private boolean isUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private void heartbeat(ClientConnection connection) {
        if (!connection.session().isOpen()) {
            removeConnection(connection.session());
            return;
        }
        if (connection.pingOutstanding().get() && System.currentTimeMillis() - connection.lastPong().get() > 10000) {
            removeConnection(connection.session());
            try {
                connection.session().close();
            } catch (IOException ignored) {
            }
            return;
        }
        connection.pingOutstanding().set(true);
        send(connection.session(), Map.of("type", "ping"));
    }

    private void removeConnection(WebSocketSession session) {
        ClientConnection connection = connections.remove(session.getId());
        if (connection != null && connection.heartbeat() != null) {
            connection.heartbeat().cancel(true);
        }
    }

    private void send(WebSocketSession session, Map<String, Object> message) {
        try {
            if (session.isOpen()) {
                synchronized (session) {
                    session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
                }
            }
        } catch (IOException ignored) {
        }
    }

    private static final class ClientConnection {
        private final UUID userId;
        private final WebSocketSession session;
        private final Set<String> channels;
        private final AtomicLong lastPong = new AtomicLong(System.currentTimeMillis());
        private final AtomicBoolean pingOutstanding = new AtomicBoolean(false);
        private volatile ScheduledFuture<?> heartbeat;

        private ClientConnection(UUID userId, WebSocketSession session, Set<String> channels) {
            this.userId = userId;
            this.session = session;
            this.channels = channels;
        }

        private UUID userId() {
            return userId;
        }

        private WebSocketSession session() {
            return session;
        }

        private Set<String> channels() {
            return channels;
        }

        private AtomicLong lastPong() {
            return lastPong;
        }

        private AtomicBoolean pingOutstanding() {
            return pingOutstanding;
        }

        private ScheduledFuture<?> heartbeat() {
            return heartbeat;
        }

        private void scheduleHeartbeat(ScheduledFuture<?> heartbeat) {
            this.heartbeat = heartbeat;
        }
    }
}
