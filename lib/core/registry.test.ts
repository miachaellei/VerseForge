import assert from "node:assert/strict";
import test from "node:test";
import { AgentToolRegistry, assertAgentBudget, type AgentPermission, type AgentTool } from "./agent-runtime.ts";
import { ModelProviderRegistry, type ModelProvider } from "./model-provider.ts";

function fakeProvider(id: string): ModelProvider {
  return {
    id,
    protocol: "openai-compatible",
    async listModels() { return ["test-model"]; },
    async testConnection() { return { ok: true, message: "ok" }; },
    async getCapabilities() { return { streaming: true, tools: true, strictJsonSchema: true, promptCaching: false, accurateUsage: true }; },
    async generate() { return { id: "response", text: "ok", finishReason: "stop", usage: {} }; },
    async *stream() { yield { type: "done", finishReason: "stop" }; },
  };
}

test("model registry rejects duplicate and unknown providers", () => {
  const registry = new ModelProviderRegistry();
  registry.register(fakeProvider("provider-1"));
  assert.equal(registry.get("provider-1").id, "provider-1");
  assert.throws(() => registry.register(fakeProvider("provider-1")), /已注册/);
  assert.throws(() => registry.get("missing"), /未知/);
});

test("agent tools validate inputs and receive explicit permissions", async () => {
  const registry = new AgentToolRegistry();
  const tool: AgentTool<{ chapter: number }, { chapter: number }> = {
    definition: { name: "get_chapter", description: "读取章节", parameters: { type: "object" } },
    validate(input): { chapter: number } {
      if (!input || typeof input !== "object" || typeof (input as { chapter?: unknown }).chapter !== "number") throw new Error("invalid input");
      return input as { chapter: number };
    },
    async execute(input, permission) {
      if (permission.visibleThroughChapter !== undefined && input.chapter > permission.visibleThroughChapter) throw new Error("future chapter denied");
      return { chapter: input.chapter };
    },
  };
  registry.register(tool);

  const permission: AgentPermission = {
    projectId: "project-1",
    sourceDocumentIds: [],
    visibleThroughChapter: 3,
    canReadFuturePlans: false,
    canCreateCandidateKinds: ["chapter-draft"],
    canWriteCanonicalData: false,
  };

  assert.deepEqual(await registry.execute("get_chapter", { chapter: 3 }, permission), { chapter: 3 });
  await assert.rejects(registry.execute("get_chapter", { chapter: 4 }, permission), /denied/);
  await assert.rejects(registry.execute("missing", {}, permission), /未注册/);
});

test("agent budget must be finite and positive", () => {
  assert.doesNotThrow(() => assertAgentBudget({ maxModelCalls: 3, maxToolCalls: 5, maxInputTokens: 1_000, maxOutputTokens: 500, timeoutMs: 30_000 }));
  assert.throws(() => assertAgentBudget({ maxModelCalls: 0, maxToolCalls: 5, maxInputTokens: 1_000, maxOutputTokens: 500, timeoutMs: 30_000 }), /正数/);
});
