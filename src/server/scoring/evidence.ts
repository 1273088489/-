// P2-05 证据采集与投影 —— 从真实执行/解析产物生成 evidence_fact。
// 原则：所有评分证据必须来自已采集数据（git_diff / test_output / file_content / runtime），
// 隐藏测试相关证据标记 internal=true，绝不进入公开 API/UI。
import fs from "node:fs";
import path from "node:path";
import type { EvidenceFact, EvidenceFactSourceType, ReviewEvidenceFileContent, ReviewEvidenceInput, ReviewEvidenceRepository, ReviewEvidenceRuntime, ReviewEvidenceTestRun } from "@/server/ai";
import { materializeRepository } from "@/server/runner/materialize";
import type { IngestSource } from "@/server/repo/ingest";

/** 单条证据输出上限（detail 截断，避免 DB/API 过大）。 */
export const MAX_EVIDENCE_DETAIL_CHARS = 4_000;
/** 单次评分的证据总数上限（超出按重要性截断）。 */
export const MAX_EVIDENCE_FACTS = 60;
/** 单次评分读取的仓库文件上限（file_content）。 */
export const MAX_FILE_FACTS = 30;
/** 单文件读取上限（超出只读取前缀）。 */
export const MAX_FILE_FACT_BYTES = 32 * 1024;
/** 单次评分文件内容总读取上限。 */
export const MAX_FILE_TOTAL_BYTES = 256 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".md", ".markdown", ".txt", ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".jsx",
  ".ts", ".tsx", ".json", ".yml", ".yaml", ".sh", ".py", ".sql", ".toml", ".ini",
  ".gitignore", ".env.example", ".dockerignore",
]);

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".cache"]);

function truncate(text: string, max = MAX_EVIDENCE_DETAIL_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…（截断）`;
}

/** 仓库快照 → git_diff 证据。 */
export function buildGitDiffFacts(repository: ReviewEvidenceRepository | undefined): EvidenceFact[] {
  if (!repository) return [];
  const { diff } = repository;
  const facts: EvidenceFact[] = [
    {
      sourceType: "git_diff",
      label: "仓库变更摘要",
      detail: `${diff.filesChanged} 个文件变更，+${diff.insertions} / -${diff.deletions}（基线 ${diff.baseRef}）`,
      ref: "diff:summary",
    },
  ];
  for (const file of diff.files.slice(0, 30)) {
    facts.push({
      sourceType: "git_diff",
      label: `变更文件：${file.path}`,
      detail: `${file.status}，+${file.insertions} / -${file.deletions}`,
      ref: `diff:${file.path}`,
    });
  }
  return facts;
}

/** 测试运行结果（公开+隐藏）→ test_output 证据；隐藏标记 internal。 */
export function buildTestOutputFacts(testRuns: ReviewEvidenceTestRun[] | undefined): EvidenceFact[] {
  if (!testRuns || testRuns.length === 0) return [];
  return testRuns.map((run) => {
    const internal = run.kind === "hidden";
    const prefix = run.kind === "hidden" ? "隐藏测试" : "公开测试";
    const outcome = run.passed ? "通过" : run.status === "error" ? "运行错误" : run.status === "skipped" ? "跳过" : "未通过";
    return {
      sourceType: "test_output",
      label: `${prefix}：${run.name}`,
      detail: `${outcome}（${run.durationMs}ms）：${truncate(run.message || "无额外信息", 1_000)}`,
      ref: `test:${run.key}`,
      internal,
    };
  });
}

/** 主沙箱运行（P2-03 main）→ runtime 证据。 */
export function buildRuntimeFacts(runtime: ReviewEvidenceRuntime | null | undefined): EvidenceFact[] {
  if (!runtime) return [];
  const phases = runtime.phases
    .map((phase) => `${phase.label}${phase.skipped ? "（跳过）" : ""}:${phase.exitCode ?? "?"}`)
    .join(" / ");
  return [
    {
      sourceType: "runtime",
      label: "沙箱主执行",
      detail: `状态 ${runtime.status === "success" ? "成功" : `失败（${runtime.errorCode || "未知"}）`}，退出码 ${runtime.exitCode ?? "无"}，耗时 ${runtime.durationMs}ms，阶段：${phases || "无"}${runtime.message ? `；说明：${truncate(runtime.message, 500)}` : ""}`,
      ref: "run:main",
    },
  ];
}

/** 文件内容 → file_content 证据（仅公开，学习者自己的仓库文件）。 */
export function buildFileContentFacts(fileContents: ReviewEvidenceFileContent[] | undefined): EvidenceFact[] {
  if (!fileContents || fileContents.length === 0) return [];
  return fileContents.slice(0, MAX_FILE_FACTS).map((file) => ({
    sourceType: "file_content",
    label: `文件：${file.path}`,
    detail: truncate(file.content),
    ref: `file:${file.path}`,
  }));
}

/** 汇总全部证据；超过上限时优先保留 runtime/test_output/git_diff 摘要。 */
export function buildEvidenceFacts(input: ReviewEvidenceInput): EvidenceFact[] {
  const facts: EvidenceFact[] = [
    ...buildRuntimeFacts(input.runtime),
    ...buildTestOutputFacts(input.testRuns),
    ...buildGitDiffFacts(input.repository),
    ...buildFileContentFacts(input.fileContents),
  ];
  if (facts.length <= MAX_EVIDENCE_FACTS) return facts;
  const priority: EvidenceFactSourceType[] = ["runtime", "test_output", "git_diff", "file_content"];
  const sorted = [...facts].sort((left, right) => {
    const lp = priority.indexOf(left.sourceType);
    const rp = priority.indexOf(right.sourceType);
    return (lp === -1 ? 99 : lp) - (rp === -1 ? 99 : rp) || left.label.localeCompare(right.label);
  });
  return sorted.slice(0, MAX_EVIDENCE_FACTS);
}

/** 公开 API 投影：剔除 internal（隐藏测试）证据。 */
export function publicEvidenceFacts(facts: EvidenceFact[]): EvidenceFact[] {
  return facts.filter((fact) => !fact.internal);
}

/**
 * 重新物化仓库并在宿主上读取受限文本文件，生成 file_content 证据。
 * 只读文件、不执行任何仓库代码；读取上限受 MAX_FILE_* 约束。
 */
export async function collectFileContentFacts(source: IngestSource, options: { maxFiles?: number; maxBytesPerFile?: number; maxTotalBytes?: number } = {}): Promise<EvidenceFact[]> {
  const maxFiles = options.maxFiles ?? MAX_FILE_FACTS;
  const maxBytesPerFile = options.maxBytesPerFile ?? MAX_FILE_FACT_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? MAX_FILE_TOTAL_BYTES;
  const materialized = await materializeRepository(source).catch(() => null);
  if (!materialized) return [];
  try {
    const facts: EvidenceFact[] = [];
    let total = 0;
    const walk = (dir: string): void => {
      if (facts.length >= maxFiles || total >= maxTotalBytes) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        if (facts.length >= maxFiles || total >= maxTotalBytes) return;
        if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext) && entry.name !== "Dockerfile" && entry.name !== "Makefile") continue;
        let content = "";
        try {
          const stat = fs.statSync(full);
          if (!stat.isFile()) continue;
          const length = Math.min(stat.size, maxBytesPerFile);
          content = fs.readFileSync(full, { encoding: "utf8", flag: "r" }).slice(0, length);
        } catch {
          continue;
        }
        const relative = path.relative(materialized.projectDir, full).split(path.sep).join("/");
        total += Buffer.byteLength(content, "utf8");
        facts.push({
          sourceType: "file_content",
          label: `文件：${relative}`,
          detail: content || "（空文件）",
          ref: `file:${relative}`,
        });
      }
    };
    walk(materialized.projectDir);
    return facts;
  } finally {
    materialized.cleanup();
  }
}

/** 把文件内容事实转换为评分输入的 fileContents（截断以控制 prompt 大小）。 */
export function fileFactsToContents(facts: EvidenceFact[], maxCharsPerFile = 2_000, maxTotal = 30_000): ReviewEvidenceFileContent[] {
  const contents: ReviewEvidenceFileContent[] = [];
  let total = 0;
  for (const fact of facts) {
    if (fact.sourceType !== "file_content" || !fact.ref?.startsWith("file:")) continue;
    const filePath = fact.ref.slice("file:".length);
    const content = truncate(fact.detail, maxCharsPerFile);
    total += content.length;
    if (total > maxTotal) break;
    contents.push({ path: filePath, content });
  }
  return contents;
}
