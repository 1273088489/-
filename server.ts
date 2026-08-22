import { createServer } from "node:http";
import type { Socket } from "node:net";
import "next/dist/server/node-environment";
import next from "next";
import { eq } from "drizzle-orm";
import { db as curriculumDb } from "@/server/curriculum/service";
import { getSessionUserByToken } from "@/server/auth/session";
import { courses } from "@/server/db/schema";
import { createDockerExec } from "@/server/sandbox/docker";
import { createTerminalDatabase, cleanupTerminalContainers, getOrCreateTerminalRuntime, reapExpiredTerminalRuntimes } from "@/server/terminal/runtime";
import { createTerminalGateway, getCookieValue } from "@/server/terminal/gateway";

const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname: "localhost", port });
const handle = app.getRequestHandler();

await app.prepare();
const handleUpgrade = app.getUpgradeHandler();

const dockerExec = createDockerExec();
const terminalOptions = {
  db: createTerminalDatabase(),
  dockerExec,
  image: process.env.TERMINAL_IMAGE,
  ttlMs: process.env.TERMINAL_TTL_MS ? Number(process.env.TERMINAL_TTL_MS) : undefined,
  instanceId: process.env.TERMINAL_INSTANCE_ID,
};

try {
  await reapExpiredTerminalRuntimes(terminalOptions);
} catch (error) {
  console.error("terminal startup reaper failed", error);
}

const gateway = createTerminalGateway({
  authenticate: (cookieHeader) => getSessionUserByToken(getCookieValue(cookieHeader, "qz_session")),
  isKnownCourse: (courseSlug) => Boolean(curriculumDb.select({ id: courses.id }).from(courses).where(eq(courses.slug, courseSlug)).get()),
  resolveRuntime: async (userId, courseSlug) => getOrCreateTerminalRuntime(terminalOptions, userId, courseSlug),
  touchRuntime: (userId, courseSlug) => {
    const runtime = terminalOptions.db.getRuntime(userId, courseSlug);
    if (!runtime) return;
    const timestamp = new Date().toISOString();
    terminalOptions.db.touchRuntime(runtime.id, timestamp, timestamp);
  },
  cleanup: () => cleanupTerminalContainers(terminalOptions),
});

const server = createServer(async (request, response) => {
  if (await gateway.handleRequest(request, response)) return;
  await handle(request, response);
});
const connections = new Set<Socket>();
server.on("connection", (socket) => {
  connections.add(socket);
  socket.once("close", () => connections.delete(socket));
});

server.on("upgrade", async (request, socket, head) => {
  if (await gateway.handleUpgrade(request, socket, head)) return;
  await handleUpgrade(request, socket, head);
});

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  console.log("received " + signal + ", cleaning terminal containers");
  try {
    await gateway.shutdown();
  } catch (error) {
    console.error("terminal shutdown cleanup failed", error);
  } finally {
    try {
      await app.close();
    } catch (error) {
      console.error("Next shutdown failed", error);
    }
    for (const socket of connections) socket.destroy();
    server.close(() => process.exit(0));
  }
}

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });

server.listen(port, () => {
  console.log("> Server listening at http://localhost:" + port + " as " + (dev ? "development" : "production"));
});
