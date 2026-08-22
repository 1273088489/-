# Docker ttyd shared learning terminal - Intent

## TaskIntentDraft

- Requested outcome: Implement the approved Docker plus ttyd shared learning terminal plan without committing changes
- Goal: Authenticated learners can use one secure persistent terminal shared by lesson and exercise pages per user and course
- Success evidence:
- Focused runtime and gateway tests, typecheck, full tests, build, diff check, and opt-in Docker/browser smoke evidence
- Stop condition: done, blocked by a concrete external condition, needs-verification, or scope-exceeded
- Non-goals:
- Do not pull images, add dependencies, reset existing changes, or modify unrelated curriculum/auth behavior
- Scope: src/server/terminal runtime, custom ttyd proxy, lesson/exercise terminal UI, configuration, tests, and verification
- Change kinds:
- architecture-and-feature
- Risk hints:
- Docker lifecycle, WebSocket proxying, persistent volume retention, auth boundary, and existing dirty worktree

## BaselineReadSetHint

- CONTEXT.md
- docs/aegis/plans/2026-08-21-ttyd-learning-terminal.md
- src/server/auth/session.ts
- src/server/sandbox/docker.ts
- src/server/sandbox/runner.ts
- node_modules/next/dist/docs/01-app/02-guides/custom-server.md

## BaselineUsageDraft

- Required baseline refs:
- CONTEXT.md
- docs/aegis/plans/2026-08-21-ttyd-learning-terminal.md
- src/server/auth/session.ts
- src/server/sandbox/docker.ts
- src/server/sandbox/runner.ts
- node_modules/next/dist/docs/01-app/02-guides/custom-server.md
- Acknowledged before plan:
- none
- Cited in plan:
- none
- Missing refs:
- CONTEXT.md
- docs/aegis/plans/2026-08-21-ttyd-learning-terminal.md
- src/server/auth/session.ts
- src/server/sandbox/docker.ts
- src/server/sandbox/runner.ts
- node_modules/next/dist/docs/01-app/02-guides/custom-server.md
- Advisory decision: needs-baseline-readback

## ImpactStatementDraft

- Compatibility boundary: Preserve one-shot sandbox semantics, current session auth, lesson/exercise submission behavior, and unrelated dirty changes
- Affected layers:
- runtime, database, server gateway, frontend, configuration, tests
- Owners:
- captain
- runtime-owner
- proxy-owner
- frontend-owner
- quality-owner
- Invariants:
- One canonical persistent terminal owner; one user-course runtime; no host execution fallback, public Docker port, host mount, Docker socket, or automatic image pull
- Non-goals:
- Do not pull images, add dependencies, reset existing changes, or modify unrelated curriculum/auth behavior

These records are Method Pack drafts / hints, not authoritative runtime decisions.
