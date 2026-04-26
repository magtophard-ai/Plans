package com.plans.backend.api.notifications;

import com.plans.backend.api.auth.AuthenticatedUser;
import com.plans.backend.service.NotificationService;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    Map<String, Object> list(
        AuthenticatedUser authenticatedUser,
        @RequestParam(defaultValue = "1") String page,
        @RequestParam(defaultValue = "50") String limit
    ) {
        return notificationService.list(authenticatedUser.id(), page, limit);
    }

    @PatchMapping("/{id}/read")
    Map<String, Object> read(AuthenticatedUser authenticatedUser, @PathVariable UUID id) {
        return notificationService.read(authenticatedUser.id(), id);
    }

    @PatchMapping("/read-all")
    Map<String, Object> readAll(AuthenticatedUser authenticatedUser) {
        return notificationService.readAll(authenticatedUser.id());
    }
}
