package com.plans.backend.api.realtime;

import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class RealtimeEventPublisher {
    private final RealtimeWebSocketHandler webSocketHandler;

    public RealtimeEventPublisher(RealtimeWebSocketHandler webSocketHandler) {
        this.webSocketHandler = webSocketHandler;
    }

    public void emit(String channel, String event, Map<String, Object> payload) {
        webSocketHandler.emit(channel, event, payload);
    }

    public void emitAfterCommit(String channel, String event, Map<String, Object> payload) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            emit(channel, event, payload);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                emit(channel, event, payload);
            }
        });
    }
}
