import { PassThrough, Readable } from "node:stream";
import type { Duplex } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { buildTerminalUpstreamHeaders, createTerminalGateway, getCookieValue, parseTerminalRoute } from "../../src/server/terminal/gateway";

function request(url: string, cookie?: string): IncomingMessage {
  const incoming = Readable.from([]) as unknown as IncomingMessage;
  Object.assign(incoming, { url, method: "GET", headers: cookie ? { cookie } : {} });
  return incoming;
}

function response(): { value: ServerResponse; status?: number; body: string } {
  let status: number | undefined;
  let body = "";
  const value = {
    headersSent: false,
    writeHead(this: { headersSent: boolean }, nextStatus: number) { status = nextStatus; this.headersSent = true; return this; },
    end(chunk?: string) { body += chunk ?? ""; },
    destroy(this: { headersSent: boolean }) { this.headersSent = true; },
  } as unknown as ServerResponse;
  return { value, get status() { return status; }, get body() { return body; } } as { value: ServerResponse; status?: number; body: string };
}

describe("terminal gateway", () => {
  it("parses only validated terminal course paths", () => {
    expect(parseTerminalRoute("/lesson/course-1")).toBeNull();
    expect(parseTerminalRoute("/terminal/course-1/")).toEqual({ courseSlug: "course-1", upstreamPath: "/" });
    expect(parseTerminalRoute("/terminal/course-1/static/app.js?x=1")).toEqual({ courseSlug: "course-1", upstreamPath: "/static/app.js?x=1" });
    expect(parseTerminalRoute("/terminal/course_1/")).toBeNull();
    expect(getCookieValue("other=x; qz_session=token%2Done", "qz_session")).toBe("token-one");
    expect(getCookieValue("qz_session=%", "qz_session")).toBeNull();
  });

  it("does not forward browser authentication headers to ttyd", () => {
    const headers = buildTerminalUpstreamHeaders({ headers: { cookie: "qz_session=secret", authorization: "Bearer secret", forwarded: "for=client", "x-forwarded-for": "client", "sec-websocket-key": "key" } } as unknown as IncomingMessage, "Upgrade", { address: "10.0.0.2" });
    expect(headers.cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    expect(headers.forwarded).toBeUndefined();
    expect(headers["x-forwarded-for"]).toBeUndefined();
    expect(headers["sec-websocket-key"]).toBe("key");
    expect(headers.connection).toBe("Upgrade");
  });

  it("rejects anonymous HTTP access before runtime resolution", async () => {
    let resolved = false;
    const gateway = createTerminalGateway({
      authenticate: () => null,
      isKnownCourse: () => true,
      resolveRuntime: async () => { resolved = true; return { address: "10.0.0.2" }; },
      cleanup: async () => undefined,
    });
    const captured = response();
    expect(await gateway.handleRequest(request("/terminal/course-1/"), captured.value)).toBe(true);
    expect(captured.status).toBe(401);
    expect(resolved).toBe(false);
  });

  it("rejects malformed terminal paths without proxying", async () => {
    let proxied = false;
    const gateway = createTerminalGateway({
      authenticate: () => ({ id: "user-1" }),
      isKnownCourse: () => true,
      resolveRuntime: async () => ({ address: "10.0.0.2" }),
      proxyHttp: () => { proxied = true; },
      cleanup: async () => undefined,
    });
    const captured = response();
    expect(await gateway.handleRequest(request("/terminal/not_valid/"), captured.value)).toBe(true);
    expect(captured.status).toBe(404);
    expect(proxied).toBe(false);
  });

  it("uses only the authenticated course runtime target, never client target input", async () => {
    let seen: { courseSlug: string; address: string; upstreamPath: string } | null = null;
    const gateway = createTerminalGateway({
      authenticate: (cookie) => getCookieValue(cookie, "qz_session") === "session-token" ? { id: "user-1" } : null,
      isKnownCourse: (slug) => slug === "course-1",
      resolveRuntime: async (userId, courseSlug) => {
        expect(userId).toBe("user-1");
        expect(courseSlug).toBe("course-1");
        return { address: "10.0.0.2" };
      },
      proxyHttp: (_request, _response, route, target) => { seen = { courseSlug: route.courseSlug, address: target.address, upstreamPath: route.upstreamPath }; },
      cleanup: async () => undefined,
    });
    const captured = response();
    await gateway.handleRequest(request("/terminal/course-1/?address=127.0.0.1%3A9999", "qz_session=session-token"), captured.value);
    expect(seen).toEqual({ courseSlug: "course-1", address: "10.0.0.2", upstreamPath: "/?address=127.0.0.1%3A9999" });
  });

  it("returns terminal unavailable for an invalid runtime target", async () => {
    let proxied = false;
    const gateway = createTerminalGateway({
      authenticate: () => ({ id: "user-1" }),
      isKnownCourse: () => true,
      resolveRuntime: async () => ({ address: "client-controlled-host" }),
      proxyHttp: () => { proxied = true; },
      cleanup: async () => undefined,
    });
    const captured = response();
    await gateway.handleRequest(request("/terminal/course-1/"), captured.value);
    expect(captured.status).toBe(503);
    expect(proxied).toBe(false);
  });

  it("returns a terminal error when the default HTTP upstream refuses", async () => {
    const gateway = createTerminalGateway({
      authenticate: () => ({ id: "user-1" }),
      isKnownCourse: () => true,
      resolveRuntime: async () => ({ address: "127.0.0.2" }),
      cleanup: async () => undefined,
    });
    const captured = response();
    await gateway.handleRequest(request("/terminal/course-1/"), captured.value);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(captured.status).toBe(503);
  });

  it("returns a terminal error when HTTP proxy setup throws", async () => {
    const gateway = createTerminalGateway({
      authenticate: () => ({ id: "user-1" }),
      isKnownCourse: () => true,
      resolveRuntime: async () => ({ address: "10.0.0.2" }),
      proxyHttp: () => { throw new Error("proxy unavailable"); },
      cleanup: async () => undefined,
    });
    const captured = response();
    await gateway.handleRequest(request("/terminal/course-1/"), captured.value);
    expect(captured.status).toBe(503);
  });

  it("touches runtime activity from WebSocket traffic", async () => {
    const socket = new PassThrough();
    let touches = 0;
    const gateway = createTerminalGateway({
      authenticate: () => ({ id: "user-1" }),
      isKnownCourse: () => true,
      resolveRuntime: async () => ({ address: "10.0.0.2" }),
      touchRuntime: () => { touches += 1; },
      proxyWebSocket: () => undefined,
      cleanup: async () => undefined,
    });
    await gateway.handleUpgrade(request("/terminal/course-1/"), socket, Buffer.alloc(0));
    socket.emit("data", Buffer.from("terminal input"));
    expect(touches).toBe(1);
    socket.destroy();
  });

  it("returns an upgrade error when WebSocket proxy setup throws", async () => {
    let ended = "";
    const socket = { end(message: string) { ended = message; } } as unknown as Duplex;
    const gateway = createTerminalGateway({
      authenticate: () => ({ id: "user-1" }),
      isKnownCourse: () => true,
      resolveRuntime: async () => ({ address: "10.0.0.2" }),
      proxyWebSocket: () => { throw new Error("proxy unavailable"); },
      cleanup: async () => undefined,
    });
    await gateway.handleUpgrade(request("/terminal/course-1/"), socket, Buffer.alloc(0));
    expect(ended).toContain("503 Service Unavailable");
  });

  it("delegates non-terminal HTTP paths to Next", async () => {
    const gateway = createTerminalGateway({
      authenticate: () => null,
      isKnownCourse: () => false,
      resolveRuntime: async () => ({ address: "10.0.0.2" }),
      cleanup: async () => undefined,
    });
    expect(await gateway.handleRequest(request("/lesson/course-1"), response().value)).toBe(false);
  });

  it("delegates shutdown cleanup once", async () => {
    let cleanupCalls = 0;
    const gateway = createTerminalGateway({
      authenticate: () => null,
      isKnownCourse: () => true,
      resolveRuntime: async () => ({ address: "10.0.0.2" }),
      cleanup: async () => { cleanupCalls += 1; },
    });
    await Promise.all([gateway.shutdown(), gateway.shutdown()]);
    expect(cleanupCalls).toBe(1);
  });
});
