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
@RequestMapping("/api/venues")
public class VenueController {
    private final DiscoveryQueryService discoveryQueryService;

    public VenueController(DiscoveryQueryService discoveryQueryService) {
        this.discoveryQueryService = discoveryQueryService;
    }

    @GetMapping("/{id}")
    Map<String, Object> venue(AuthenticatedUser authenticatedUser, @PathVariable UUID id) {
        return discoveryQueryService.venue(id);
    }

    @GetMapping("/{id}/events")
    Map<String, Object> venueEvents(
        AuthenticatedUser authenticatedUser,
        @PathVariable UUID id,
        @RequestParam(defaultValue = "1") String page,
        @RequestParam(defaultValue = "20") String limit
    ) {
        return discoveryQueryService.venueEvents(id, page, limit);
    }
}
