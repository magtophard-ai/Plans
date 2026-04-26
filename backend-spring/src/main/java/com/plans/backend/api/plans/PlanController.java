package com.plans.backend.api.plans;

import com.plans.backend.api.auth.AuthenticatedUser;
import com.plans.backend.service.PlanService;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/plans")
public class PlanController {
    private final PlanService planService;

    public PlanController(PlanService planService) {
        this.planService = planService;
    }

    @GetMapping
    Map<String, Object> list(
        AuthenticatedUser authenticatedUser,
        @RequestParam(required = false) String lifecycle,
        @RequestParam(required = false) String participant,
        @RequestParam(defaultValue = "1") String page,
        @RequestParam(defaultValue = "20") String limit
    ) {
        return planService.listPlans(authenticatedUser.id(), lifecycle, participant, page, limit);
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> create(
        AuthenticatedUser authenticatedUser,
        @RequestBody(required = false) Map<String, Object> body
    ) {
        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(planService.createPlan(authenticatedUser.id(), body == null ? Map.of() : body));
    }

    @GetMapping("/by-token/{token}")
    Map<String, Object> getByToken(@PathVariable String token) {
        return planService.getPlanByToken(token);
    }

    @PostMapping("/by-token/{token}/join")
    Map<String, Object> joinByToken(AuthenticatedUser authenticatedUser, @PathVariable String token) {
        return planService.joinPlanByToken(authenticatedUser.id(), token);
    }

    @GetMapping("/{id}")
    Map<String, Object> get(AuthenticatedUser authenticatedUser, @PathVariable UUID id) {
        return planService.getPlan(id);
    }

    @PostMapping("/{id}/cancel")
    Map<String, Object> cancel(AuthenticatedUser authenticatedUser, @PathVariable UUID id) {
        return planService.cancel(authenticatedUser.id(), id);
    }

    @PostMapping("/{id}/complete")
    Map<String, Object> complete(AuthenticatedUser authenticatedUser, @PathVariable UUID id) {
        return planService.complete(authenticatedUser.id(), id);
    }

    @GetMapping("/{planId}/participants")
    Map<String, Object> participants(AuthenticatedUser authenticatedUser, @PathVariable UUID planId) {
        return planService.participants(planId);
    }

    @PostMapping("/{planId}/participants")
    Map<String, Object> inviteParticipant(
        AuthenticatedUser authenticatedUser,
        @PathVariable UUID planId,
        @RequestBody(required = false) Map<String, Object> body
    ) {
        return planService.inviteParticipant(authenticatedUser.id(), planId, body == null ? Map.of() : body);
    }

    @PatchMapping("/{planId}/participants/{uid}")
    Map<String, Object> updateParticipant(
        AuthenticatedUser authenticatedUser,
        @PathVariable UUID planId,
        @PathVariable UUID uid,
        @RequestBody(required = false) Map<String, Object> body
    ) {
        return planService.updateParticipant(authenticatedUser.id(), planId, uid, body == null ? Map.of() : body);
    }

    @DeleteMapping("/{planId}/participants/{uid}")
    ResponseEntity<Void> removeParticipant(
        AuthenticatedUser authenticatedUser,
        @PathVariable UUID planId,
        @PathVariable UUID uid
    ) {
        planService.removeParticipant(authenticatedUser.id(), planId, uid);
        return ResponseEntity.noContent().build();
    }
}
