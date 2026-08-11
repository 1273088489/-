<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Dependency worktree rules

- Before any package-manager command that can mutate dependencies, inspect `node_modules` with PowerShell `Get-Item` and check `LinkType`.
- When `node_modules` is a `Junction` or symbolic link, run read-only or project scripts such as `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, and database scripts as needed, but do not run `npm install`, `npm ci`, `npm update`, or other dependency-mutating commands.
- If a task requires adding, removing, or rebuilding a dependency, stop before installation. Record the package-manifest change, verify the link target, remove only the link (never its target contents), and choose an intentional independent install or synchronized install in the owning worktree.
- Never recursively delete `node_modules` while it is a junction or symbolic link. Confirm the resolved target is outside the current worktree before any cleanup.
- The current Codex worktree may use a junction to the main worktree's dependency directory for this project. Treat the linked directory as shared state and report any dependency change before proceeding.
