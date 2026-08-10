export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseJsonArray<T>(raw: string | null | undefined, fallback: T[] = []): T[] {
  const value = parseJson<unknown>(raw, fallback);
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export function parseStringArray(raw: string | null | undefined): string[] {
  return parseJsonArray<unknown>(raw).filter((item): item is string => typeof item === "string");
}
