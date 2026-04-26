package com.plans.backend.api.error;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

class GlobalExceptionHandlerTest {

    private final MockMvc mockMvc = MockMvcBuilders
        .standaloneSetup(new ErrorFixtureController())
        .setControllerAdvice(new GlobalExceptionHandler())
        .build();

    @Test
    void apiExceptionUsesCodeMessageEnvelope() throws Exception {
        mockMvc.perform(get("/fixture/api-error"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("Fixture not found"))
            .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void unexpectedExceptionUsesInternalErrorEnvelope() throws Exception {
        mockMvc.perform(get("/fixture/unexpected-error"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
            .andExpect(jsonPath("$.message").value("Internal server error"))
            .andExpect(jsonPath("$.length()").value(2));
    }

    @RestController
    static class ErrorFixtureController {
        @GetMapping("/fixture/api-error")
        void apiError() {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Fixture not found");
        }

        @GetMapping("/fixture/unexpected-error")
        void unexpectedError() {
            throw new IllegalStateException("boom");
        }
    }
}
