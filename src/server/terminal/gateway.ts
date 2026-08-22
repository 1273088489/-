import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import type { Duplex } from "node:stream";
import { validateCourseSlug } from "./runtime";

export const TERMINAL_PORT = 7681;
const TERMINAL_PREFIX = "/terminal";
type TrackSocket = (socket: Duplex) => void;

export interface TerminalRoute {
  courseSlug: string;
  upstreamPath: string;
}

export interface TerminalTarget {
  address: string;
}

export type TerminalUser = { id: string };

export interface TerminalGatewayOptions {
  authenticate: (cookieHeader: string | undefined) => Promise<TerminalUser | null> | TerminalUser | null;
  isKnownCourse: (courseSlug: string) => Promise<boolean> | boolean;
  resolveRuntime: (userId: string, courseSlug: string) => Promise<TerminalTarget>;
  touchRuntime?: (userId: string, courseSlug: string) => void | Promise<void>;
  proxyHttp?: (request: IncomingMessage, response: ServerResponse, route: TerminalRoute, target: TerminalTarget) => void;
  proxyWebSocket?: (request: IncomingMessage, socket: Duplex, head: Buffer, route: TerminalRoute, target: TerminalTarget) => void;
  cleanup: () => Promise<void>;
}

export function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function parseTerminalRoute(requestUrl: string | undefined): TerminalRoute | null {
  if (!requestUrl) return null;
  let url: URL;
  try {
    url = new URL(requestUrl, "http://terminal.local");
  } catch {
    return null;
  }
  if (url.pathname !== TERMINAL_PREFIX && !url.pathname.startsWith(TERMINAL_PREFIX + "/")) return null;
  const remainder = url.pathname.slice((TERMINAL_PREFIX + "/").length);
  const [encodedSlug, ...rest] = remainder.split("/");
  if (!encodedSlug || encodedSlug.includes("%2F") || encodedSlug.includes("%2f")) return null;
  let courseSlug: string;
  try {
    courseSlug = decodeURIComponent(encodedSlug);
    validateCourseSlug(courseSlug);
  } catch {
    return null;
  }
  const suffix = rest.join("/");
  return { courseSlug, upstreamPath: "/" + suffix + url.search };
}

function isTerminalPath(requestUrl: string | undefined): boolean {
  if (!requestUrl) return false;
  try {
    const pathname = new URL(requestUrl, "http://terminal.local").pathname;
    return pathname === TERMINAL_PREFIX || pathname.startsWith(TERMINAL_PREFIX + "/");
  } catch {
    return false;
  }
}

function jsonError(response: ServerResponse, status: number, message: string): void {
  if (response.headersSent || response.writableEnded || response.destroyed) {
    response.destroy();
    return;
  }
  const body = JSON.stringify({ ok: false, error: message });
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

function assertTarget(target: TerminalTarget): void {
  if (!target || typeof target.address !== "string" || isIP(target.address) === 0) throw new Error("invalid terminal target");
}

export function buildTerminalUpstreamHeaders(request: IncomingMessage, connection: "close" | "Upgrade", target: TerminalTarget): Record<string, string | string[] | undefined> {
  assertTarget(target);
  const headers = { ...request.headers };
  for (const name of ["cookie", "authorization", "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"]) delete headers[name];
  headers.host = target.address + ":" + TERMINAL_PORT;
  headers.connection = connection;
  return headers;
}

function defaultProxyHttp(request: IncomingMessage, response: ServerResponse, route: TerminalRoute, target: TerminalTarget, trackSocket?: TrackSocket): void {
  assertTarget(target);
  const upstream = httpRequest({
    hostname: target.address,
    port: TERMINAL_PORT,
    method: request.method,
    path: route.upstreamPath,
    headers: buildTerminalUpstreamHeaders(request, "close", target),
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  if (trackSocket) upstream.on("socket", trackSocket);
  upstream.on("error", () => jsonError(response, 503, "终端运行环境尚未准备好"));
  request.pipe(upstream);
}

function defaultProxyWebSocket(request: IncomingMessage, socket: Duplex, head: Buffer, route: TerminalRoute, target: TerminalTarget, trackSocket?: TrackSocket): void {
  assertTarget(target);
  const upstream = httpRequest({
    hostname: target.address,
    port: TERMINAL_PORT,
    method: "GET",
    path: route.upstreamPath,
    headers: { ...buildTerminalUpstreamHeaders(request, "Upgrade", target), upgrade: "websocket" },
  });
  if (trackSocket) upstream.on("socket", trackSocket);
  upstream.once("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
    const lines = ["HTTP/1.1 " + (upstreamResponse.statusCode ?? 101) + " " + (upstreamResponse.statusMessage ?? "Switching Protocols")];
    for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) lines.push(upstreamResponse.rawHeaders[index] + ": " + upstreamResponse.rawHeaders[index + 1]);
    lines.push("", "");
    trackSocket?.(upstreamSocket);
    socket.write(lines.join("\r\n"));
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
  });
  upstream.once("response", () => socket.destroy());
  upstream.once("error", () => socket.destroy());
  upstream.end();
}

export function createTerminalGateway(options: TerminalGatewayOptions) {
  let cleanupPromise: Promise<void> | null = null;
  const upstreamSockets = new Set<Duplex>();
  const trackSocket: TrackSocket = (socket) => {
    upstreamSockets.add(socket);
    socket.once("close", () => upstreamSockets.delete(socket));
  };

  async function authorize(request: IncomingMessage): Promise<TerminalUser | null> {
    return options.authenticate(request.headers.cookie);
  }

  async function resolve(request: IncomingMessage, response: ServerResponse): Promise<{ route: TerminalRoute; target: TerminalTarget; user: TerminalUser } | null> {
    const route = parseTerminalRoute(request.url);
    if (!route) {
      jsonError(response, 404, "终端路径不存在");
      return null;
    }
    let user: TerminalUser | null;
    try {
      user = await authorize(request);
    } catch {
      jsonError(response, 503, "终端认证服务暂不可用");
      return null;
    }
    if (!user) {
      jsonError(response, 401, "未登录");
      return null;
    }
    try {
      if (!(await options.isKnownCourse(route.courseSlug))) {
        jsonError(response, 404, "课程不存在");
        return null;
      }
    } catch {
      jsonError(response, 503, "课程服务暂不可用");
      return null;
    }
    try {
      const target = await options.resolveRuntime(user.id, route.courseSlug);
      assertTarget(target);
      return { route, target, user };
    } catch {
      jsonError(response, 503, "终端运行环境尚未准备好");
      return null;
    }
  }

  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    if (!isTerminalPath(request.url)) return false;
    const resolved = await resolve(request, response);
    if (!resolved) return true;
    try {
      if (options.proxyHttp) options.proxyHttp(request, response, resolved.route, resolved.target);
      else defaultProxyHttp(request, response, resolved.route, resolved.target, trackSocket);
    } catch {
      jsonError(response, 503, "终端运行环境尚未准备好");
    }
    return true;
  }

  async function handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<boolean> {
    if (!isTerminalPath(request.url)) return false;
    const route = parseTerminalRoute(request.url);
    if (!route) {
      socket.end("HTTP/1.1 404 Not Found\\r\\nConnection: close\\r\\n\\r\\n");
      return true;
    }
    let user: TerminalUser | null;
    try {
      user = await authorize(request);
    } catch {
      socket.end("HTTP/1.1 503 Service Unavailable\\r\\nConnection: close\\r\\n\\r\\n");
      return true;
    }
    if (!user) {
      socket.end("HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\n\\r\\n");
      return true;
    }
    try {
      if (!(await options.isKnownCourse(route.courseSlug))) {
        socket.end("HTTP/1.1 404 Not Found\\r\\nConnection: close\\r\\n\\r\\n");
        return true;
      }
    } catch {
      socket.end("HTTP/1.1 503 Service Unavailable\\r\\nConnection: close\\r\\n\\r\\n");
      return true;
    }
    try {
      const target = await options.resolveRuntime(user.id, route.courseSlug);
      assertTarget(target);
      if (options.touchRuntime) {
        let lastTouchedAt = 0;
        const touch = () => {
          const now = Date.now();
          if (now - lastTouchedAt < 60_000) return;
          lastTouchedAt = now;
          void Promise.resolve(options.touchRuntime?.(user.id, route.courseSlug)).catch(() => undefined);
        };
        socket.on("data", touch);
        socket.once("close", () => socket.off("data", touch));
      }
      if (options.proxyWebSocket) options.proxyWebSocket(request, socket, head, route, target);
      else defaultProxyWebSocket(request, socket, head, route, target, trackSocket);
    } catch {
      socket.end("HTTP/1.1 503 Service Unavailable\\r\\nConnection: close\\r\\n\\r\\n");
    }
    return true;
  }

  async function shutdown(): Promise<void> {
    cleanupPromise ??= (async () => {
      for (const socket of upstreamSockets) socket.destroy();
      await options.cleanup();
    })();
    return cleanupPromise;
  }

  return { handleRequest, handleUpgrade, shutdown };
}
