export function parseJsonObject<T extends object>(text: string): T {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const value: unknown = JSON.parse(withoutFence);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("模型返回的 JSON 不是对象");
    return value as T;
  } catch (error) {
    if (error instanceof Error && error.message === "模型返回的 JSON 不是对象") throw error;
    throw new Error("模型没有返回有效的结构化 JSON", { cause: error });
  }
}

export function requireStringFields<T extends object>(value: T, fields: (keyof T)[]): T {
  for (const field of fields) {
    if (typeof value[field] !== "string") throw new Error(`模型结果缺少文本字段：${String(field)}`);
  }
  return value;
}

