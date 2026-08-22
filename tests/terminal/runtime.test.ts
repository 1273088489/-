import { describe, expect, it } from "vitest";
import type { DockerCommandResult, DockerExec } from "../../src/server/sandbox/docker";
import { buildTerminalCreateArgs, buildTerminalWorkspaceInitArgs, cleanupTerminalContainers, getOrCreateTerminalRuntime, reapExpiredTerminalRuntimes, resetTerminalRuntime, TerminalUnavailableError } from "../../src/server/terminal/runtime";
import type { TerminalDatabase, TerminalRuntime } from "../../src/server/terminal/types";

const IMAGE = "ghcr.io/example/ttyd@sha256:" + "a".repeat(64);

function result(stdout = "", code = 0, stderr = ""): DockerCommandResult {
  return { stdout, stderr, code, signal: null, timedOut: false };
}

function memoryDb(): TerminalDatabase {
  const records = new Map<string, TerminalRuntime>();
  return {
    getRuntime(userId, courseSlug) {
      return [...records.values()].find((runtime) => runtime.userId === userId && runtime.courseSlug === courseSlug);
    },
    listRuntimes() { return [...records.values()]; },
    insertRuntime(runtime) { records.set(runtime.id, runtime); return runtime; },
    updateRuntime(id, patch) {
      const current = records.get(id);
      if (!current) return undefined;
      const updated = { ...current, ...patch };
      records.set(id, updated);
      return updated;
    },
    touchRuntime(id, lastActiveAt, updatedAt) {
      const current = records.get(id);
      if (current) records.set(id, { ...current, lastActiveAt, updatedAt });
    },
    deleteRuntime(id) { records.delete(id); },
  };
}

function labelsFromArgs(args: string[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] !== "--label") continue;
    const [key, ...value] = args[index + 1].split("=");
    labels[key] = value.join("=");
  }
  return labels;
}

function fakeDocker(calls: string[][], tamperContainer = false, invalidNetwork = false, networkInspectError = false): DockerExec {
  let volumeLabels: Record<string, string> | null = null;
  let container: Record<string, unknown> | null = null;
  let networkExists = false;
  let inspectCount = 0;
  return async (args) => {
    calls.push(args);
    if (args[0] === "image" && args[1] === "inspect") return result("image");
    if (args[0] === "run") return result();
    if (args[0] === "network" && args[1] === "inspect") {
      if (networkInspectError) return result("", 1, "permission denied");
      if (!networkExists) return result("", 1, "network not found");
      return result(JSON.stringify({ Id: "network-id", Internal: !invalidNetwork, Labels: invalidNetwork ? {} : { "quanzhan.managed": "terminal" } }));
    }
    if (args[0] === "network" && args[1] === "create") {
      networkExists = true;
      return result("network-id");
    }
    if (args[0] === "volume" && args[1] === "create") {
      volumeLabels = labelsFromArgs(args);
      return result(args[args.length - 1]);
    }
    if (args[0] === "volume" && args[1] === "inspect") return result(JSON.stringify({ Labels: volumeLabels }));
    if (args[0] === "create") {
      const imageIndex = args.indexOf("ttyd") - 1;
      container = {
        Id: "container-id",
        State: { Running: false },
        Config: { Image: args[imageIndex], User: "1000:1000", WorkingDir: "/workspace", Cmd: ["ttyd", "--port", "7681", "--writable", "sh", "-l"], Labels: labelsFromArgs(args) },
        HostConfig: { NetworkMode: "quanzhan-terminal-internal", ReadonlyRootfs: true, Memory: 512 * 1024 * 1024, NanoCpus: 1_000_000_000, PidsLimit: 256, SecurityOpt: ["no-new-privileges:true"], CapDrop: ["ALL"], PortBindings: {}, Tmpfs: { "/tmp": "rw,noexec,nosuid,size=64m", "/run": "rw,noexec,nosuid,size=16m" } },
        Mounts: [{ Type: "volume", Name: args[args.indexOf("--mount") + 1].split(",")[1].split("=")[1], Destination: "/workspace", RW: true }],
        NetworkSettings: { Networks: { "quanzhan-terminal-internal": { IPAddress: "10.0.0.2", NetworkID: "network-id" } } },
      };
      return result("container-id\n");
    }
    if (args[0] === "start") {
      if (container) (container.State as { Running: boolean }).Running = true;
      return result(args[1]);
    }
    if (args[0] === "inspect") {
      inspectCount += 1;
      if (tamperContainer && container && inspectCount > 1) (container.Config as { User: string }).User = "0:0";
      return result(JSON.stringify(container));
    }
    if (args[0] === "rm") { container = null; return result(); }
    if (args[0] === "volume" && args[1] === "rm") { volumeLabels = null; return result(); }
    return result();
  };
}

describe("terminal runtime", () => {
  it("builds a networkless one-shot workspace initializer", () => {
    const args = buildTerminalWorkspaceInitArgs({ image: IMAGE, volumeName: "volume" });
    expect(args).toEqual(expect.arrayContaining(["run", "--rm", "--network", "none", "--user", "0:0", "--cap-drop", "ALL", "--cap-add", "CHOWN", "if [ \"$(stat -c %u:%g /workspace)\" != \"1000:1000\" ]; then chown -R 1000:1000 /workspace; fi"]));
    expect(args).toContain("type=volume,source=volume,destination=/workspace");
    expect(args).not.toContain("-p");
    expect(args.some((arg) => arg.includes("/var/run/docker.sock") || arg.startsWith("/home/"))).toBe(false);
  });

  it("builds restricted ttyd args without host paths or published ports", () => {
    const args = buildTerminalCreateArgs({ image: IMAGE, volumeName: "volume", containerName: "container", userId: "user-1", courseSlug: "course-1", expiresAt: "2030-01-01T00:00:00.000Z", instanceId: "instance-1" });
    expect(args).toEqual(expect.arrayContaining(["--network", "quanzhan-terminal-internal", "--read-only", "--cpus", "1.0", "--memory", "512m", "--pids-limit", "256", "--workdir", "/workspace", "--user", "1000:1000", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "quanzhan.managed=terminal"]));
    expect(args.some((arg) => arg.startsWith("quanzhan.instance=") && arg.length === "quanzhan.instance=".length + 32)).toBe(true);
    expect(args).toContain("type=volume,source=volume,destination=/workspace");
    expect(args).not.toContain("-p");
    expect(args).not.toContain("--publish");
    expect(args.some((arg) => arg.includes("/var/run/docker.sock") || arg.startsWith("/home/"))).toBe(false);
  });

  it("inspects a pinned local image before create/start and never pulls", async () => {
    const calls: string[][] = [];
    await getOrCreateTerminalRuntime({ db: memoryDb(), dockerExec: fakeDocker(calls), image: IMAGE, instanceId: "instance-1" }, "user-1", "course-1");
    expect(calls[0]).toEqual(["image", "inspect", IMAGE]);
    expect(calls.some((call) => call.includes("pull"))).toBe(false);
    expect(calls.findIndex((call) => call[0] === "create")).toBeGreaterThan(0);
    expect(calls.some((call) => call[0] === "start")).toBe(true);
    expect(calls.some((call) => call[0] === "run" && call.includes("if [ \"$(stat -c %u:%g /workspace)\" != \"1000:1000\" ]; then chown -R 1000:1000 /workspace; fi"))).toBe(true);
  });

  it("fails closed when network inspection is denied", async () => {
    const calls: string[][] = [];
    await expect(getOrCreateTerminalRuntime({ db: memoryDb(), dockerExec: fakeDocker(calls, false, false, true), image: IMAGE }, "user-1", "course-1")).rejects.toBeInstanceOf(TerminalUnavailableError);
    expect(calls.some((call) => call[0] === "network" && call[1] === "create")).toBe(false);
  });

  it("rejects a network that fails post-create ownership validation", async () => {
    const calls: string[][] = [];
    await expect(getOrCreateTerminalRuntime({ db: memoryDb(), dockerExec: fakeDocker(calls, false, true), image: IMAGE }, "user-1", "course-1")).rejects.toBeInstanceOf(TerminalUnavailableError);
    expect(calls.some((call) => call[0] === "volume" || call[0] === "create")).toBe(false);
  });

  it("rejects invalid TTL values before cleanup", async () => {
    const calls: string[][] = [];
    await expect(reapExpiredTerminalRuntimes({ db: memoryDb(), dockerExec: fakeDocker(calls), ttlMs: 0 })).rejects.toBeInstanceOf(TerminalUnavailableError);
    expect(calls).toHaveLength(0);
  });

  it("rejects unpinned images without Docker calls", async () => {
    const calls: string[][] = [];
    await expect(getOrCreateTerminalRuntime({ db: memoryDb(), dockerExec: fakeDocker(calls), image: "latest" }, "user-1", "course-1")).rejects.toBeInstanceOf(TerminalUnavailableError);
    expect(calls).toHaveLength(0);
  });

  it("accepts a local sha256 image id and inspects it without pulling", async () => {
    const image = "sha256:" + "a".repeat(64);
    const calls: string[][] = [];
    await getOrCreateTerminalRuntime({ db: memoryDb(), dockerExec: fakeDocker(calls), image, instanceId: "instance-1" }, "user-1", "course-1");
    expect(calls[0]).toEqual(["image", "inspect", image]);
    expect(calls.some((call) => call.includes("pull"))).toBe(false);
  });

  it("rebuilds when the configured container lease changes", async () => {
    const calls: string[][] = [];
    const db = memoryDb();
    const dockerExec = fakeDocker(calls);
    await getOrCreateTerminalRuntime({ db, dockerExec, image: IMAGE, ttlMs: 60_000 }, "user-1", "course-1");
    await getOrCreateTerminalRuntime({ db, dockerExec, image: IMAGE, ttlMs: 120_000 }, "user-1", "course-1");
    expect(calls.filter((call) => call[0] === "create")).toHaveLength(2);
  });

  it("reuses the same user-course runtime and separates other keys", async () => {
    const calls: string[][] = [];
    const options = { db: memoryDb(), dockerExec: fakeDocker(calls), image: IMAGE };
    const first = await getOrCreateTerminalRuntime(options, "user-1", "course-1");
    const second = await getOrCreateTerminalRuntime(options, "user-1", "course-1");
    const other = await getOrCreateTerminalRuntime(options, "user-2", "course-1");
    expect(second.containerName).toBe(first.containerName);
    expect(other.containerName).not.toBe(first.containerName);
    expect(calls.filter((call) => call[0] === "create")).toHaveLength(2);
    expect(calls.filter((call) => call[0] === "start")).toHaveLength(2);
  });

  it("rebuilds an untrusted existing container without deleting its volume", async () => {
    const calls: string[][] = [];
    const db = memoryDb();
    const options = { db, dockerExec: fakeDocker(calls, true), image: IMAGE };
    await getOrCreateTerminalRuntime(options, "user-1", "course-1");
    await getOrCreateTerminalRuntime(options, "user-1", "course-1");
    expect(calls.filter((call) => call[0] === "create")).toHaveLength(2);
    expect(calls.filter((call) => call[0] === "run")).toHaveLength(2);
    expect(calls.some((call) => call[0] === "volume" && call[1] === "rm")).toBe(false);
  });

  it("reaps expired records in container-then-volume order", async () => {
    const calls: string[][] = [];
    const db = memoryDb();
    const options = { db, dockerExec: fakeDocker(calls), image: IMAGE, now: () => new Date("2030-01-02T00:00:00.000Z"), ttlMs: 60_000 };
    const runtime = await getOrCreateTerminalRuntime(options, "user-1", "course-1");
    db.updateRuntime(runtime.id, { lastActiveAt: "2030-01-01T00:00:00.000Z" });
    expect(await reapExpiredTerminalRuntimes(options)).toBe(1);
    const cleanup = calls.slice(-2);
    expect(cleanup[0]).toEqual(["rm", "-f", runtime.containerName]);
    expect(cleanup[1]).toEqual(["volume", "rm", runtime.volumeName]);
    expect(db.getRuntime("user-1", "course-1")).toBeUndefined();
  });

  it("reset removes the container and volume, while shutdown cleanup retains records and volumes", async () => {
    const calls: string[][] = [];
    const db = memoryDb();
    const options = { db, dockerExec: fakeDocker(calls), image: IMAGE };
    const runtime = await getOrCreateTerminalRuntime(options, "user-1", "course-1");
    await cleanupTerminalContainers(options);
    expect(db.getRuntime("user-1", "course-1")).toBeDefined();
    expect(calls).toContainEqual(["rm", "-f", runtime.containerName]);
    expect(calls.some((call) => call[0] === "volume" && call[1] === "rm")).toBe(false);
    expect(await resetTerminalRuntime(options, "user-1", "course-1")).toBe(true);
    expect(db.getRuntime("user-1", "course-1")).toBeUndefined();
  });
});
