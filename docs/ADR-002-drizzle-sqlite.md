# ADR-002: Drizzle ORM + SQLite 优先，PostgreSQL 可切换
- 状态：Accepted
- 背景：本机用户环境可能没有 Docker/Postgres（本机确无 Docker 可用），但最终课程要教 PostgreSQL。
- 决策：MVP 用 Drizzle ORM + better-sqlite3，schema 写在 `src/server/db/schema.ts`；通过 Drizzle 适配层可切换 PostgreSQL（提供 `drizzle.config.ts` 和 docker-compose）。
- 后果：SQLite 零依赖、开箱即用；PostgreSQL 需在课程后期演示迁移。
