// 测试辅助：Docker 可用性探测与沙箱容器查询（供真实 smoke 测试复用）。
// binary 默认取 SANDBOX_DOCKER_BINARY ?? "docker"，与 src/server/sandbox/docker.ts 的
// createDockerExec 默认值保持一致（受限环境可指向 sudo 包装脚本）。
import { execFileSync } from "node:child_process";

function resolveBinary(binary?: string): string {
  return binary ?? process.env.SANDBOX_DOCKER_BINARY ?? "docker";
}

/** Docker CLI/守护进程可用（`docker version` 成功）。 */
export function dockerAvailable(binary?: string): boolean {
  try {
    execFileSync(resolveBinary(binary), ["version", "--format", "{{.Server.Version}}"], {
      stdio: "ignore",
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

/** 本地镜像存在（`docker image inspect <image>` 成功）。 */
export function imageAvailable(image: string, binary?: string): boolean {
  try {
    execFileSync(resolveBinary(binary), ["image", "inspect", image], {
      stdio: "ignore",
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 列出全部沙箱容器名（含已退出的）：`docker ps -a --filter name=quanzhan-sandbox- --format {{.Names}}`。
 * docker 不可用时返回空数组（可用性由 dockerAvailable 把关）。
 */
export function listSandboxContainers(binary?: string): string[] {
  try {
    const raw = execFileSync(
      resolveBinary(binary),
      ["ps", "-a", "--filter", "name=quanzhan-sandbox-", "--format", "{{.Names}}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 },
    );
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}
