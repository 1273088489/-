import type { DockerExec } from "../sandbox/docker";

export interface TerminalRuntime {
  id: string;
  userId: string;
  courseSlug: string;
  volumeName: string;
  containerName: string;
  networkName: string;
  containerId: string;
  containerAddress: string;
  workspaceInitializedAt: string;
  workspaceInitializationVersion: number;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalDatabase {
  getRuntime(userId: string, courseSlug: string): TerminalRuntime | undefined;
  listRuntimes(): TerminalRuntime[];
  insertRuntime(runtime: TerminalRuntime): TerminalRuntime;
  updateRuntime(id: string, patch: Partial<Pick<TerminalRuntime, "containerId" | "containerAddress" | "workspaceInitializedAt" | "workspaceInitializationVersion" | "lastActiveAt" | "updatedAt">>): TerminalRuntime | undefined;
  touchRuntime(id: string, lastActiveAt: string, updatedAt: string): void;
  deleteRuntime(id: string): void;
}

export interface TerminalRuntimeOptions {
  db: TerminalDatabase;
  dockerExec: DockerExec;
  image?: string;
  now?: () => Date;
  ttlMs?: number;
  instanceId?: string;
}

export interface TerminalRuntimeHandle extends TerminalRuntime {
  address: string;
}
