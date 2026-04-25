# Current Status

Canonical status file lives in [`docs/CURRENT_STATUS.md`](./docs/CURRENT_STATUS.md).
Forward-looking handoff + most recent checkpoint live in
[`docs/HANDOFF.md`](./docs/HANDOFF.md).

Snapshot:

- State: Frozen MVP core + beta hardening pass complete (per-op errors,
  offline/reconnect UX, feed+chat pagination, stale sendMessage
  auto-clear). Next recommended task is Content Ops / Real Events
  Pipeline v1 — see the Checkpoint section in `docs/HANDOFF.md`.
- Quality gate: backend and main frontend TypeScript checks are independent from `src/fest-animations/**`
- Remaining intentional dev-only area: OTP mock (`1111`)
