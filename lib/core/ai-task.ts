export type AiTaskStatus = "queued" | "running" | "paused" | "cancelling" | "cancelled" | "succeeded" | "failed";

export interface AiTaskRecord {
  id: string;
  projectId: string;
  kind: string;
  idempotencyKey: string;
  inputHash: string;
  providerId: string;
  model: string;
  status: AiTaskStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: { code: string; message: string; retryable: boolean };
  usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
}

export interface CreateAiTaskInput {
  id: string;
  projectId: string;
  kind: string;
  idempotencyKey: string;
  inputHash: string;
  providerId: string;
  model: string;
  now?: string;
}

export interface AiTaskRepository {
  create(input: CreateAiTaskInput): Promise<{ task: AiTaskRecord; created: boolean }>;
  get(id: string): Promise<AiTaskRecord | undefined>;
  listByProject(projectId: string): Promise<AiTaskRecord[]>;
  save(task: AiTaskRecord, expectedRevision: number): Promise<AiTaskRecord>;
}

const ALLOWED_TRANSITIONS: Record<AiTaskStatus, AiTaskStatus[]> = {
  queued: ["running", "paused", "cancelled"],
  running: ["paused", "cancelling", "succeeded", "failed"],
  paused: ["queued", "cancelled"],
  cancelling: ["cancelled", "failed"],
  cancelled: [],
  succeeded: [],
  failed: ["queued"],
};

export function transitionAiTask(
  task: AiTaskRecord,
  nextStatus: AiTaskStatus,
  options: {
    now?: string;
    error?: AiTaskRecord["error"];
    usage?: AiTaskRecord["usage"];
  } = {},
): AiTaskRecord {
  if (!ALLOWED_TRANSITIONS[task.status].includes(nextStatus)) throw new Error(`非法 AI 任务状态转换：${task.status} → ${nextStatus}`);
  const now = options.now ?? new Date().toISOString();
  const terminal = nextStatus === "succeeded" || nextStatus === "failed" || nextStatus === "cancelled";
  if (nextStatus === "failed" && !options.error) throw new Error("失败任务必须记录错误信息");
  if (nextStatus !== "failed" && options.error) throw new Error("只有失败任务可以写入错误信息");

  return {
    ...task,
    status: nextStatus,
    revision: task.revision + 1,
    updatedAt: now,
    startedAt: nextStatus === "running" ? task.startedAt ?? now : task.startedAt,
    finishedAt: terminal ? now : undefined,
    error: nextStatus === "failed" ? options.error : undefined,
    usage: options.usage ?? task.usage,
  };
}

export class MemoryAiTaskRepository implements AiTaskRepository {
  readonly #tasks = new Map<string, AiTaskRecord>();
  readonly #idempotency = new Map<string, string>();

  async create(input: CreateAiTaskInput): Promise<{ task: AiTaskRecord; created: boolean }> {
    const scope = `${input.projectId}\u0000${input.idempotencyKey}`;
    const existingId = this.#idempotency.get(scope);
    if (existingId) {
      const existing = this.#tasks.get(existingId);
      if (!existing) throw new Error("AI 任务幂等索引损坏");
      return { task: structuredClone(existing), created: false };
    }
    if (this.#tasks.has(input.id)) throw new Error(`AI 任务 ID 已存在：${input.id}`);
    const now = input.now ?? new Date().toISOString();
    const task: AiTaskRecord = {
      id: input.id,
      projectId: input.projectId,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      inputHash: input.inputHash,
      providerId: input.providerId,
      model: input.model,
      status: "queued",
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.#tasks.set(task.id, structuredClone(task));
    this.#idempotency.set(scope, task.id);
    return { task: structuredClone(task), created: true };
  }

  async get(id: string): Promise<AiTaskRecord | undefined> {
    const task = this.#tasks.get(id);
    return task ? structuredClone(task) : undefined;
  }

  async listByProject(projectId: string): Promise<AiTaskRecord[]> {
    return [...this.#tasks.values()]
      .filter((task) => task.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((task) => structuredClone(task));
  }

  async save(task: AiTaskRecord, expectedRevision: number): Promise<AiTaskRecord> {
    const current = this.#tasks.get(task.id);
    if (!current) throw new Error(`AI 任务不存在：${task.id}`);
    if (current.revision !== expectedRevision) throw new Error(`AI 任务版本冲突：期望 ${expectedRevision}，实际 ${current.revision}`);
    if (task.revision !== expectedRevision + 1) throw new Error("AI 任务修订号必须单调递增");
    this.#tasks.set(task.id, structuredClone(task));
    return structuredClone(task);
  }
}

