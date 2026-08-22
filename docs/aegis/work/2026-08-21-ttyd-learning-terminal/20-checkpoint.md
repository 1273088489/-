# Docker ttyd shared learning terminal - Checkpoint

- Task ID: 2026-08-21-ttyd-learning-terminal
- Current todo: Capture baseline and validate terminal runtime contract
- Active slice: Batch 1 persistent terminal runtime
- Blocked on: none
- Next step: Review runtime owner output, then perform spec and quality reviews before integration

## Checkpoint Update

- Current todo: Implement persistent terminal runtime and database ownership
- Active slice: Batch 1 persistent terminal runtime: schema, Docker argv builder, local image validation, create/reuse, reset, TTL cleanup, focused tests
- Completed todos:
- Capture baseline and validate terminal runtime contract
- Evidence refs:
- docs/aegis/plans/2026-08-21-ttyd-learning-terminal.md
- CONTEXT.md
- src/server/auth/session.ts
- src/server/sandbox/docker.ts
- src/server/sandbox/runner.ts
- Blocked on: none
- Next step: Review runtime implementer output, then perform specification and quality reviews

## Checkpoint Update

- Current todo: Implement persistent terminal runtime and database ownership
- Active slice: Recover Batch 1 after stalled worker: inspect existing runtime draft, add focused tests, repair start/health/lock/cleanup/security gaps
- Completed todos:
- none
- Evidence refs:
- src/server/terminal/runtime.ts
- src/server/terminal/types.ts
- Blocked on: Previous runtime worker stalled before tests; recovery worker is active
- Next step: Review recovery worker output and run fresh focused verification

## Checkpoint Update

- Current todo: Implement authenticated ttyd proxy and lifecycle server
- Active slice: Batch 2 authenticated same-origin HTTP/WebSocket ttyd gateway, known-course validation, signal cleanup, and gateway tests
- Completed todos:
- Implement persistent terminal runtime and database ownership
- Evidence refs:
- src/server/terminal/runtime.ts
- tests/terminal/runtime.test.ts
- docs/aegis/plans/2026-08-21-ttyd-learning-terminal.md
- Blocked on: none
- Next step: Read custom server and route/auth contracts, then implement a testable gateway owner

## Checkpoint Update

- Current todo: Completed Docker ttyd shared learning terminal implementation and verification
- Active slice: No remaining implementation slice; real Docker and logged-in browser smoke remain deployment-gated residual verification
- Completed todos:
- Implement persistent terminal runtime and database ownership
- Implement authenticated ttyd proxy and lifecycle server
- Replace mock terminal across lesson and exercise pages
- Document configuration and run verification suite
- Review security, lifecycle behavior, and final diff
- Evidence refs:
- src/server/terminal/runtime.ts
- src/server/terminal/gateway.ts
- server.ts
- tests/terminal/gateway.test.ts
- tests/terminal/runtime.test.ts
- tests/terminal/frontend-contract.test.ts
- proof-bundle.md
- Blocked on: none
- Next step: Deploy with npm run db:push and a pre-pulled approved TERMINAL_IMAGE, then run opt-in Docker and logged-in browser smoke

## Checkpoint Update

- Current todo: Completed terminal configuration, workspace ownership repair, real Docker smoke, and final verification
- Active slice: No remaining implementation slice; approved digest image is installed and real Docker smoke passed
- Completed todos:
- Implement persistent terminal runtime and database ownership
- Implement authenticated ttyd proxy and lifecycle server
- Replace mock terminal across lesson and exercise pages
- Repair named volume ownership for non-root workspace writes
- Document configuration and run verification suite
- Review security, lifecycle behavior, and final diff
- Evidence refs:
- src/server/terminal/runtime.ts
- src/server/terminal/types.ts
- src/server/db/schema.ts
- drizzle/0008_terminal_workspace_initialized.sql
- tests/terminal/runtime.test.ts
- proof-bundle.md
- Blocked on: none
- Next step: Run npm run dev and use the logged-in lesson or exercise page; the local environment is configured

## Checkpoint Update

- Current todo: Cleanup complete: temporary smoke artifacts and approved smoke persistent state removed
- Active slice: No cleanup slice remains; active user 111 runtime and port 3000 development server intentionally retained
- Completed todos:
- Inventory processes, temporary files, Docker resources, and runtime records
- Remove only confirmed smoke artifacts and stale test processes
- Verify no unintended project resources were deleted
- Run cleanup and repository checks
- Evidence refs:
- src/server/terminal/runtime.ts
- drizzle/0009_terminal_workspace_initialization_v2.sql
- proof-bundle.md
- Blocked on: none
- Next step: No further cleanup required; continue using the existing development server
