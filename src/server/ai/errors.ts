export type AiOperation = "教练" | "代码评审" | "选型评估";

export class AiProviderError extends Error {
  readonly operation: AiOperation;
  readonly cause: unknown;

  constructor(operation: AiOperation, cause: unknown) {
    super(`AI provider ${operation} failed`);
    this.name = "AiProviderError";
    this.operation = operation;
    this.cause = cause;
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === "object" && error !== null && "status" in error) {
    return String((error as { status?: unknown }).status).toLowerCase();
  }
  return String(error).toLowerCase();
}

export function describeAiProviderError(error: unknown, operation: AiOperation): {
  message: string;
  code: "AI_PROVIDER_CONFIG" | "AI_PROVIDER_RATE_LIMIT" | "AI_PROVIDER_TIMEOUT" | "AI_PROVIDER_UNAVAILABLE";
} {
  const text = errorText(error instanceof AiProviderError ? error.cause : error);
  if (/401|403|api.?key|authentication|unauthorized/.test(text)) {
    return { message: `AI ${operation}失败：provider 配置无效，请检查 API key。`, code: "AI_PROVIDER_CONFIG" };
  }
  if (/429|rate.?limit|too many requests/.test(text)) {
    return { message: `AI ${operation}失败：provider 请求过于频繁，请稍后重试。`, code: "AI_PROVIDER_RATE_LIMIT" };
  }
  if (/timeout|timed out|etimedout|abort/.test(text)) {
    return { message: `AI ${operation}失败：provider 请求超时，请稍后重试。`, code: "AI_PROVIDER_TIMEOUT" };
  }
  return { message: `AI ${operation}失败：provider 暂时不可用，请稍后重试。`, code: "AI_PROVIDER_UNAVAILABLE" };
}
