package com.plans.backend.api.discovery;

import com.plans.backend.api.auth.AuthenticatedUser;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/search")
public class SearchController {
    private final DiscoveryQueryService discoveryQueryService;

    public SearchController(DiscoveryQueryService discoveryQueryService) {
        this.discoveryQueryService = discoveryQueryService;
    }

    @GetMapping("/events")
    Map<String, Object> events(
        AuthenticatedUser authenticatedUser,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String category,
        @RequestParam(name = "date_from", required = false) String dateFrom,
        @RequestParam(name = "date_to", required = false) String dateTo,
        @RequestParam(defaultValue = "1") String page,
        @RequestParam(defaultValue = "20") String limit
    ) {
        return discoveryQueryService.searchEvents(authenticatedUser.id(), q, category, dateFrom, dateTo, page, limit);
    }
}
