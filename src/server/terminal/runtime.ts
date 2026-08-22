import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { DockerCommandResult, DockerExec } from "../sandbox/docker";
import { sqlite } from "../db/client";
import { terminalRuntimes } from "../db/schema";
import type { TerminalDatabase, TerminalRuntime, TerminalRuntimeHandle, TerminalRuntimeOptions } from "./types";

export const TERMINAL_NETWORK_NAME = "quanzhan-terminal-internal";
export const TERMINAL_MANAGED_LABEL = "quanzhan.managed=terminal";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_IMAGE = process.env.TERMINAL_IMAGE ?? "";
const DEFAULT_INSTANCE_ID = process.env.TERMINAL_INSTANCE_ID ?? randomUUID();
const COURSE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const USER_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const DOCKER_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
// 允许裸 sha256:<image-id>：本地构建镜像（docker/ttyd-node.Dockerfile）无 registry digest，但 image id 同样内容寻址、本地不可变，安全语义等价；生产仍推荐 registry digest pin
const PINNED_IMAGE = /^(?:.+@sha256:|sha256:)[a-f0-9]{64}$/;
const WORKSPACE_INITIALIZATION_VERSION = 2;

function terminalTtlMs(options: TerminalRuntimeOptions): number {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new TerminalUnavailableError("terminal unavailable: TTL must be a positive finite duration");
  return ttlMs;
}

export class TerminalUnavailableError extends Error {
  constructor(message = "terminal unavailable: local pinned image is required") {
    super(message);
    this.name = "TerminalUnavailableError";
  }
}

export function validateCourseSlug(courseSlug: string): void {
  if (!COURSE_SLUG.test(courseSlug)) throw new Error("Invalid course slug");
}

function validateUserId(userId: string): void {
  if (!USER_ID.test(userId)) throw new Error("Invalid user id");
}

function validateDockerName(value: string): void {
  if (!DOCKER_NAME.test(value)) throw new Error("Invalid Docker resource name");
}

function safeName(prefix: string, userId: string, courseSlug: string): string {
  const digest = createHash("sha256").update(userId + ":" + courseSlug).digest("hex").slice(0, 24);
  return prefix + "-" + digest;
}

function hashLabel(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function assertPinnedImage(image: string): void {
  if (!PINNED_IMAGE.test(image)) {
    throw new TerminalUnavailableError("terminal unavailable: TERMINAL_IMAGE must be a pinned @sha256:<digest> reference or a local sha256:<image-id>");
  }
}

function dockerFailure(result: DockerCommandResult, fallback: string): TerminalUnavailableError {
  return new TerminalUnavailableError(result.stderr.trim() || fallback);
}

function isMissingResource(result: DockerCommandResult): boolean {
  return /no such (container|volume)|not found/i.test(result.stderr);
}

function isMissingNetwork(result: DockerCommandResult): boolean {
  return /no such network|network .*not found/i.test(result.stderr);
}

export function buildTerminalWorkspaceInitArgs(params: { image: string; volumeName: string }): string[] {
  assertPinnedImage(params.image);
  validateDockerName(params.volumeName);
  return [
    "run", "--rm", "--network", "none",
    "--mount", "type=volume,source=" + params.volumeName + ",destination=/workspace",
    "--memory", "64m", "--pids-limit", "16", "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
    "--user", "0:0", "--security-opt", "no-new-privileges:true",
    "--cap-drop", "ALL", "--cap-add", "CHOWN", "--entrypoint", "sh",
    params.image, "-c", "if [ \"$(stat -c %u:%g /workspace)\" != \"1000:1000\" ]; then chown -R 1000:1000 /workspace; fi",
  ];
}

export function buildTerminalCreateArgs(params: {
  image: string;
  volumeName: string;
  containerName: string;
  userId: string;
  courseSlug: string;
  expiresAt: string;
  instanceId?: string;
}): string[] {
  const instanceId = params.instanceId ?? DEFAULT_INSTANCE_ID;
  assertPinnedImage(params.image);
  validateDockerName(params.volumeName);
  validateDockerName(params.containerName);
  validateCourseSlug(params.courseSlug);
  validateUserId(params.userId);
  return [
    "create", "--name", params.containerName,
    "--network", TERMINAL_NETWORK_NAME,
    "--mount", "type=volume,source=" + params.volumeName + ",destination=/workspace",
    "--cpus", "1.0", "--memory", "512m", "--pids-limit", "256",
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
    "--tmpfs", "/run:rw,noexec,nosuid,size=16m",
    "--workdir", "/workspace",
    "--user", "1000:1000", "--env", "HOME=/tmp",
    "--security-opt", "no-new-privileges:true", "--cap-drop", "ALL",
    "--label", TERMINAL_MANAGED_LABEL,
    "--label", "quanzhan.instance=" + hashLabel(instanceId),
    "--label", "quanzhan.user=" + hashLabel(params.userId),
    "--label", "quanzhan.course=" + params.courseSlug,
    "--label", "quanzhan.expires-at=" + params.expiresAt,
    params.image, "ttyd", "--port", "7681", "--writable", "sh", "-l",
  ];
}

function createDrizzleDatabase(): TerminalDatabase {
  const db = drizzle(sqlite);
  return {
    getRuntime(userId, courseSlug) {
      return db.select().from(terminalRuntimes).where(and(eq(terminalRuntimes.userId, userId), eq(terminalRuntimes.courseSlug, courseSlug))).get();
    },
    listRuntimes() {
      return db.select().from(terminalRuntimes).all();
    },
    insertRuntime(runtime) {
      return db.insert(terminalRuntimes).values(runtime).returning().get();
    },
    updateRuntime(id, patch) {
      return db.update(terminalRuntimes).set(patch).where(eq(terminalRuntimes.id, id)).returning().get();
    },
    touchRuntime(id, lastActiveAt, updatedAt) {
      db.update(terminalRuntimes).set({ lastActiveAt, updatedAt }).where(eq(terminalRuntimes.id, id)).run();
    },
    deleteRuntime(id) {
      db.delete(terminalRuntimes).where(eq(terminalRuntimes.id, id)).run();
    },
  };
}

const locks = new Map<string, Promise<void>>();

async function withKeyLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  locks.set(key, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (locks.get(key) === queued) locks.delete(key);
  }
}

async function inspectImage(dockerExec: DockerExec, image: string): Promise<void> {
  assertPinnedImage(image);
  const result = await dockerExec(["image", "inspect", image]);
  if (result.code !== 0 || result.error) throw new TerminalUnavailableError("terminal unavailable: pinned image is not available locally");
}

interface ContainerInspection {
  id: string;
  running: boolean;
  image: string;
  user: string;
  workingDir: string;
  command: string[];
  networkMode: string;
  readonlyRootfs: boolean;
  memory: number;
  nanoCpus: number;
  pidsLimit: number;
  securityOpt: string[];
  capDrop: string[];
  labels: Record<string, string>;
  mounts: Array<{ Type: string; Name?: string; Destination: string; RW: boolean }>;
  networks: Record<string, { IPAddress?: string; NetworkID?: string }>;
  portBindings: Record<string, unknown> | null;
  tmpfs: Record<string, string>;
  address: string;
}

function parseJson<T>(result: DockerCommandResult): T | null {
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return null;
  }
}

async function ensureInternalNetwork(dockerExec: DockerExec): Promise<string> {
  const inspect = await dockerExec(["network", "inspect", "--format", "{{json .}}", TERMINAL_NETWORK_NAME]);
  if (inspect.code === 0) {
    const network = parseJson<{ Id?: string; Internal?: boolean; Labels?: Record<string, string> }>(inspect);
    if (!network?.Id || !network.Internal || network.Labels?.["quanzhan.managed"] !== "terminal") {
      throw new TerminalUnavailableError("terminal unavailable: terminal network is not a managed internal network");
    }
    return network.Id;
  }
  if (!isMissingNetwork(inspect)) throw dockerFailure(inspect, "terminal unavailable: cannot inspect terminal network");
  const create = await dockerExec(["network", "create", "--internal", "--label", TERMINAL_MANAGED_LABEL, TERMINAL_NETWORK_NAME]);
  const createdId = create.stdout.trim();
  if (create.code !== 0 || create.error || !createdId) throw dockerFailure(create, "terminal unavailable: cannot create internal network");
  const verify = await dockerExec(["network", "inspect", "--format", "{{json .}}", TERMINAL_NETWORK_NAME]);
  const network = parseJson<{ Id?: string; Internal?: boolean; Labels?: Record<string, string> }>(verify);
  if (verify.code !== 0 || !network || network.Id !== createdId || !network.Internal || network.Labels?.["quanzhan.managed"] !== "terminal") {
    throw new TerminalUnavailableError("terminal unavailable: created network failed ownership validation");
  }
  return createdId;
}

async function inspectContainer(dockerExec: DockerExec, containerName: string): Promise<ContainerInspection | null> {
  const result = await dockerExec(["inspect", "--format", "{{json .}}", containerName]);
  if (result.code !== 0 || result.error) return null;
  const raw = parseJson<{
    Id?: string;
    State?: { Running?: boolean };
    Config?: { Image?: string; User?: string; WorkingDir?: string; Cmd?: string[] | null; Labels?: Record<string, string> | null };
    HostConfig?: { NetworkMode?: string; ReadonlyRootfs?: boolean; Memory?: number; NanoCpus?: number; PidsLimit?: number; SecurityOpt?: string[] | null; CapDrop?: string[] | null; PortBindings?: Record<string, unknown> | null; Tmpfs?: Record<string, string> | null };
    Mounts?: Array<{ Type?: string; Name?: string; Destination?: string; RW?: boolean }>;
    NetworkSettings?: { Networks?: Record<string, { IPAddress?: string; NetworkID?: string }> };
  }>(result);
  if (!raw?.Id || !raw.Config || !raw.HostConfig) return null;
  const networks = raw.NetworkSettings?.Networks ?? {};
  return {
    id: raw.Id,
    running: raw.State?.Running === true,
    image: raw.Config.Image ?? "",
    user: raw.Config.User ?? "",
    workingDir: raw.Config.WorkingDir ?? "",
    command: raw.Config.Cmd ?? [],
    networkMode: raw.HostConfig.NetworkMode ?? "",
    readonlyRootfs: raw.HostConfig.ReadonlyRootfs === true,
    memory: raw.HostConfig.Memory ?? 0,
    nanoCpus: raw.HostConfig.NanoCpus ?? 0,
    pidsLimit: raw.HostConfig.PidsLimit ?? 0,
    securityOpt: raw.HostConfig.SecurityOpt ?? [],
    capDrop: raw.HostConfig.CapDrop ?? [],
    labels: raw.Config.Labels ?? {},
    mounts: (raw.Mounts ?? []).map((mount) => ({ Type: mount.Type ?? "", Name: mount.Name, Destination: mount.Destination ?? "", RW: mount.RW === true })),
    networks,
    portBindings: raw.HostConfig.PortBindings && Object.keys(raw.HostConfig.PortBindings).length > 0 ? raw.HostConfig.PortBindings : null,
    tmpfs: raw.HostConfig.Tmpfs ?? {},
    address: networks[TERMINAL_NETWORK_NAME]?.IPAddress ?? "",
  };
}

function managedResourceLabels(options: TerminalRuntimeOptions, runtime: Pick<TerminalRuntime, "userId" | "courseSlug">): Record<string, string> {
  return {
    "quanzhan.managed": "terminal",
    "quanzhan.instance": hashLabel(options.instanceId ?? DEFAULT_INSTANCE_ID),
    "quanzhan.user": hashLabel(runtime.userId),
    "quanzhan.course": runtime.courseSlug,
  };
}

function hasExpectedContainerShape(options: TerminalRuntimeOptions, runtime: TerminalRuntime, inspected: ContainerInspection, image: string, networkId: string, expectedExpiry: string, now: Date): boolean {
  const labels = managedResourceLabels(options, runtime);
  const expiry = Date.parse(expectedExpiry);
  const labelsMatch = Object.entries(labels).every(([key, value]) => inspected.labels[key] === value) && inspected.labels["quanzhan.expires-at"] === expectedExpiry && Number.isFinite(expiry) && expiry > now.getTime();
  const workspaceMount = inspected.mounts.find((mount) => mount.Type === "volume" && mount.Name === runtime.volumeName && mount.Destination === "/workspace" && mount.RW);
  const onlyManagedMounts = inspected.mounts.every((mount) => mount.Type === "volume" && mount.Name === runtime.volumeName && mount.Destination === "/workspace");
  const command = ["ttyd", "--port", "7681", "--writable", "sh", "-l"];
  return labelsMatch && inspected.image === image && inspected.user === "1000:1000" && inspected.workingDir === "/workspace" && JSON.stringify(inspected.command) === JSON.stringify(command) && inspected.networkMode === TERMINAL_NETWORK_NAME && inspected.readonlyRootfs && inspected.memory === 512 * 1024 * 1024 && inspected.nanoCpus === 1_000_000_000 && inspected.pidsLimit === 256 && inspected.securityOpt.includes("no-new-privileges:true") && inspected.capDrop.includes("ALL") && inspected.portBindings === null && inspected.tmpfs["/tmp"] === "rw,noexec,nosuid,size=64m" && inspected.tmpfs["/run"] === "rw,noexec,nosuid,size=16m" && Boolean(workspaceMount) && onlyManagedMounts && Object.keys(inspected.networks).length === 1 && inspected.networks[TERMINAL_NETWORK_NAME]?.NetworkID === networkId && Boolean(inspected.address);
}

async function resolveContainer(dockerExec: DockerExec, containerName: string): Promise<{ id: string; address: string }> {
  const inspected = await inspectContainer(dockerExec, containerName);
  if (!inspected?.running || !inspected.address) throw new TerminalUnavailableError("terminal unavailable: running container has no internal address");
  return { id: inspected.id, address: inspected.address };
}

async function initializeWorkspaceVolume(dockerExec: DockerExec, image: string, volumeName: string): Promise<void> {
  const result = await dockerExec(buildTerminalWorkspaceInitArgs({ image, volumeName }));
  if (result.code !== 0 || result.error) throw dockerFailure(result, "terminal unavailable: cannot initialize workspace volume");
}

async function ensureVolume(dockerExec: DockerExec, volumeName: string, labels: Record<string, string>): Promise<void> {
  const result = await dockerExec(["volume", "inspect", "--format", "{{json .}}", volumeName]);
  if (result.code !== 0 || result.error) throw dockerFailure(result, "terminal unavailable: workspace volume is missing");
  const volume = parseJson<{ Labels?: Record<string, string> }>(result);
  if (!volume || !Object.entries(labels).every(([key, value]) => volume.Labels?.[key] === value)) {
    throw new TerminalUnavailableError("terminal unavailable: workspace volume ownership is invalid");
  }
}

async function removeContainer(dockerExec: DockerExec, containerName: string): Promise<void> {
  const result = await dockerExec(["rm", "-f", containerName]);
  if (result.code !== 0 && !isMissingResource(result)) throw dockerFailure(result, "terminal unavailable: cannot remove terminal container");
}

async function removeContainerAndVolume(dockerExec: DockerExec, runtime: TerminalRuntime): Promise<void> {
  await removeContainer(dockerExec, runtime.containerName);
  const volume = await dockerExec(["volume", "rm", runtime.volumeName]);
  if (volume.code !== 0 && !isMissingResource(volume)) throw dockerFailure(volume, "terminal unavailable: cannot remove workspace volume");
}

function dockerId(result: DockerCommandResult): string {
  const id = result.stdout.trim().split(/\r?\n/)[0] ?? "";
  if (result.code !== 0 || result.error || !id) throw dockerFailure(result, "terminal unavailable: Docker did not return a container id");
  return id;
}

async function createAndStart(options: TerminalRuntimeOptions, params: { image: string; volumeName: string; containerName: string; userId: string; courseSlug: string; expiresAt: string }): Promise<{ id: string; address: string }> {
  const created = await options.dockerExec(buildTerminalCreateArgs({ ...params, instanceId: options.instanceId }));
  const id = dockerId(created);
  try {
    await initializeWorkspaceVolume(options.dockerExec, params.image, params.volumeName);
  } catch (error) {
    await removeContainer(options.dockerExec, params.containerName);
    throw error;
  }
  const started = await options.dockerExec(["start", params.containerName]);
  if (started.code !== 0 || started.error) {
    await removeContainer(options.dockerExec, params.containerName);
    throw dockerFailure(started, "terminal unavailable: cannot start terminal container");
  }
  try {
    return await resolveContainer(options.dockerExec, params.containerName);
  } catch (error) {
    await removeContainer(options.dockerExec, params.containerName);
    throw error;
  }
}

async function repairExisting(options: TerminalRuntimeOptions, runtime: TerminalRuntime, image: string, now: Date): Promise<TerminalRuntimeHandle> {
  await inspectImage(options.dockerExec, image);
  const networkId = await ensureInternalNetwork(options.dockerExec);
  const labels = managedResourceLabels(options, runtime);
  await ensureVolume(options.dockerExec, runtime.volumeName, labels);
  const createdAt = Date.parse(runtime.createdAt);
  if (!Number.isFinite(createdAt)) throw new TerminalUnavailableError("terminal unavailable: runtime creation timestamp is invalid");
  const expiresAt = new Date(createdAt + terminalTtlMs(options)).toISOString();
  const current = await inspectContainer(options.dockerExec, runtime.containerName);
  const currentIsTrusted = Boolean(current && hasExpectedContainerShape(options, runtime, current, image, networkId, expiresAt, now));
  if (currentIsTrusted && runtime.workspaceInitializationVersion < WORKSPACE_INITIALIZATION_VERSION) await initializeWorkspaceVolume(options.dockerExec, image, runtime.volumeName);
  let resolved: { id: string; address: string };
  if (currentIsTrusted && current) {
    if (current.running && current.address) {
      resolved = { id: current.id, address: current.address };
    } else {
      const started = await options.dockerExec(["start", runtime.containerName]);
      if (started.code !== 0 || started.error) throw dockerFailure(started, "terminal unavailable: cannot restart terminal container");
      resolved = await resolveContainer(options.dockerExec, runtime.containerName);
    }
  } else {
    if (current) await removeContainer(options.dockerExec, runtime.containerName);
    resolved = await createAndStart(options, { image, volumeName: runtime.volumeName, containerName: runtime.containerName, userId: runtime.userId, courseSlug: runtime.courseSlug, expiresAt });
  }
  const timestamp = now.toISOString();
  const updated = options.db.updateRuntime(runtime.id, { containerId: resolved.id, containerAddress: resolved.address, ...(runtime.workspaceInitializedAt ? {} : { workspaceInitializedAt: timestamp }), workspaceInitializationVersion: WORKSPACE_INITIALIZATION_VERSION, lastActiveAt: timestamp, updatedAt: timestamp });
  if (!updated) throw new TerminalUnavailableError("terminal unavailable: runtime record disappeared");
  return { ...updated, address: updated.containerAddress };
}

export async function getOrCreateTerminalRuntime(options: TerminalRuntimeOptions, userId: string, courseSlug: string): Promise<TerminalRuntimeHandle> {
  validateUserId(userId);
  validateCourseSlug(courseSlug);
  return withKeyLock(userId + ":" + courseSlug, async () => {
    const now = (options.now ?? (() => new Date()))();
    const image = options.image ?? DEFAULT_IMAGE;
    assertPinnedImage(image);
    const existing = options.db.getRuntime(userId, courseSlug);
    if (existing) return repairExisting(options, existing, image, now);
    await inspectImage(options.dockerExec, image);
    await ensureInternalNetwork(options.dockerExec);
    const volumeName = safeName("qz-term-vol", userId, courseSlug);
    const containerName = safeName("qz-term", userId, courseSlug);
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + terminalTtlMs(options)).toISOString();
    const labels = managedResourceLabels(options, { userId, courseSlug });
    const volume = await options.dockerExec([
      "volume", "create",
      "--label", TERMINAL_MANAGED_LABEL,
      "--label", "quanzhan.instance=" + labels["quanzhan.instance"],
      "--label", "quanzhan.user=" + labels["quanzhan.user"],
      "--label", "quanzhan.course=" + labels["quanzhan.course"],
      volumeName,
    ]);
    if (volume.code !== 0 || volume.error) throw dockerFailure(volume, "terminal unavailable: cannot create workspace volume");
    const cleanupRecord: TerminalRuntime = { id: "", userId, courseSlug, volumeName, containerName, networkName: TERMINAL_NETWORK_NAME, containerId: "", containerAddress: "", workspaceInitializedAt: "", workspaceInitializationVersion: 0, lastActiveAt: createdAt, createdAt, updatedAt: createdAt };
    let resolved: { id: string; address: string };
    try {
      resolved = await createAndStart(options, { image, volumeName, containerName, userId, courseSlug, expiresAt });
    } catch (error) {
      await removeContainerAndVolume(options.dockerExec, cleanupRecord);
      throw error;
    }
    const runtime: TerminalRuntime = { ...cleanupRecord, id: randomUUID(), containerId: resolved.id, containerAddress: resolved.address, workspaceInitializedAt: createdAt, workspaceInitializationVersion: WORKSPACE_INITIALIZATION_VERSION };
    try {
      const stored = options.db.insertRuntime(runtime);
      return { ...stored, address: stored.containerAddress };
    } catch (error) {
      await removeContainerAndVolume(options.dockerExec, runtime);
      throw error;
    }
  });
}

export const createTerminalRuntime = getOrCreateTerminalRuntime;

export async function resetTerminalRuntime(options: TerminalRuntimeOptions, userId: string, courseSlug: string): Promise<boolean> {
  validateUserId(userId);
  validateCourseSlug(courseSlug);
  return withKeyLock(userId + ":" + courseSlug, async () => {
    const runtime = options.db.getRuntime(userId, courseSlug);
    if (!runtime) return false;
    await removeContainerAndVolume(options.dockerExec, runtime);
    options.db.deleteRuntime(runtime.id);
    return true;
  });
}

export async function reapExpiredTerminalRuntimes(options: TerminalRuntimeOptions): Promise<number> {
  const now = (options.now ?? (() => new Date()))();
  const cutoff = now.getTime() - terminalTtlMs(options);
  let count = 0;
  for (const candidate of options.db.listRuntimes()) {
    await withKeyLock(candidate.userId + ":" + candidate.courseSlug, async () => {
      const runtime = options.db.getRuntime(candidate.userId, candidate.courseSlug);
      if (!runtime) return;
      const lastActive = Date.parse(runtime.lastActiveAt);
      if (Number.isFinite(lastActive) && lastActive > cutoff) return;
      await removeContainerAndVolume(options.dockerExec, runtime);
      options.db.deleteRuntime(runtime.id);
      count += 1;
    });
  }
  return count;
}

/** Stop terminal containers on normal shutdown while retaining volumes and DB records. */
export async function cleanupTerminalContainers(options: TerminalRuntimeOptions): Promise<void> {
  for (const runtime of options.db.listRuntimes()) await removeContainer(options.dockerExec, runtime.containerName);
}

export function createTerminalDatabase(): TerminalDatabase {
  return createDrizzleDatabase();
}
