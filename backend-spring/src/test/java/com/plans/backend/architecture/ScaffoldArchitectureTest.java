package com.plans.backend.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import com.plans.backend.api.realtime.RealtimeProtocolNotes;
import com.plans.backend.config.PackageStructure;
import org.junit.jupiter.api.Test;

class ScaffoldArchitectureTest {

    @Test
    void packageStructureIsPinnedForNextSlices() {
        assertThat(PackageStructure.API).isEqualTo("com.plans.backend.api");
        assertThat(PackageStructure.CONFIG).isEqualTo("com.plans.backend.config");
        assertThat(PackageStructure.DOMAIN).isEqualTo("com.plans.backend.domain");
        assertThat(PackageStructure.SERVICE).isEqualTo("com.plans.backend.service");
        assertThat(PackageStructure.PERSISTENCE).isEqualTo("com.plans.backend.persistence");
    }

    @Test
    void realtimeFuturePhaseIsRawJsonNotStomp() {
        assertThat(RealtimeProtocolNotes.WEB_SOCKET_PATH).isEqualTo("/api/ws");
        assertThat(RealtimeProtocolNotes.PROTOCOL).isEqualTo("raw-json");
    }
}
