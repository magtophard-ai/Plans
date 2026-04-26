package com.plans.backend.api.discovery;

import com.plans.backend.api.auth.AuthenticatedUser;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/events")
public class EventController {
    private final DiscoveryQueryService discoveryQueryService;

    public EventController(DiscoveryQueryService discoveryQueryService) {
        this.discoveryQueryService = discoveryQueryService;
    }

    @GetMapping
    Map<String, Object> events(
        AuthenticatedUser authenticatedUser,
        @RequestParam(required = false) String category,
        @RequestParam(name = "date_from", required = false) String dateFrom,
        @RequestParam(name = "date_to", required = false) String dateTo,
        @RequestParam(defaultValue = "1") String page,
        @RequestParam(defaultValue = "20") String limit
    ) {
        return discoveryQueryService.listEvents(authenticatedUser.id(), category, dateFrom, dateTo, page, limit);
    }

    @GetMapping("/{id}")
    Map<String, Object> event(AuthenticatedUser authenticatedUser, @PathVariable UUID id) {
        return discoveryQueryService.event(authenticatedUser.id(), id);
    }
}
