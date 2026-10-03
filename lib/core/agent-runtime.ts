import type { ModelToolDefinition } from "./model-provider.ts";

export type AgentKind =
  | "worldbuilding"
  | "synopsis"
  | "character"
  | "relationship"
  | "timeline"
  | "outline"
  | "writing"
  | "consistency";

export interface AgentBudget {
  maxModelCalls: number;
  maxToolCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostMinorUnits?: number;
  timeoutMs: number;
}

export interface AgentPermission {
  projectId: string;
  sourceDocumentIds: string[];
  visibleThroughChapter?: number;
  canReadFuturePlans: boolean;
  canCreateCandidateKinds: string[];
  canWriteCanonicalData: false;
}

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  definition: ModelToolDefinition;
  validate(input: unknown): TInput;
  execute(input: TInput, permission: AgentPermission): Promise<TOutput>;
}

export interface AgentDefinition {
  id: string;
  kind: AgentKind;
  version: string;
  systemInstruction: string;
  toolNames: string[];
  defaultBudget: AgentBudget;
}

export class AgentToolRegistry {
  readonly #tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    const name = tool.definition.name;
    if (this.#tools.has(name)) throw new Error(`Agent 工具已注册：${name}`);
    this.#tools.set(name, tool);
  }

  definitions(names: string[]): ModelToolDefinition[] {
    return names.map((name) => this.get(name).definition);
  }

  async execute(name: string, input: unknown, permission: AgentPermission): Promise<unknown> {
    const tool = this.get(name);
    return tool.execute(tool.validate(input), permission);
  }

  private get(name: string): AgentTool {
    const tool = this.#tools.get(name);
    if (!tool) throw new Error(`Agent 无权使用未注册工具：${name}`);
    return tool;
  }
}

export function assertAgentBudget(budget: AgentBudget): void {
  const positive = [budget.maxModelCalls, budget.maxToolCalls, budget.maxInputTokens, budget.maxOutputTokens, budget.timeoutMs];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Agent 预算必须是正数");
  if (budget.maxCostMinorUnits !== undefined && budget.maxCostMinorUnits < 0) throw new Error("Agent 费用预算不能为负数");
}

