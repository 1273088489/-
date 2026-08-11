# PostgreSQL 切换说明（课程 Phase 5+）
MVP 默认 SQLite 以保证零依赖可跑。切 PostgreSQL 的路径：

1. `npm install pg`，在 `src/server/db/client.ts` 改用 `drizzle-orm/node-postgres`，schema 不变。
2. `drizzle.config.ts` 的 dialect 改为 `postgresql`，`dbCredentials` 改为 `{ connectionString: process.env.DATABASE_URL }`。
3. 启动本地 Postgres：`docker compose up -d db`（见根目录 docker-compose.yml，若存在）。
4. `npm run db:push && npm run db:seed`。

架构上其余代码通过 `src/server/curriculum/service.ts` 的 `db` 访问，切换仅涉及 db client 与 drizzle config。
