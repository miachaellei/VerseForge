import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateRequest, GenerateResponse, ModelCapabilities, ModelProvider, StreamEvent } from "./model-provider.ts";
import { runConsistencyReview } from "./consistency-check.ts";

class ReviewProvider implements ModelProvider {
  readonly id = "review";
  readonly protocol = "openai-compatible" as const;
  response: Record<string, unknown> = { summary: "发现一项冲突", confidence: 0.9, issues: [{ kind: "timeline", severity: "error", title: "到达过早", description: "路程时间不足", evidence: [{ sourceId: "chapter", quote: "十分钟后抵达北岸" }, { sourceId: "canon", quote: "航程至少两小时" }], suggestion: "延长航程", repairCandidate: "两小时后抵达北岸" }] };
  async listModels() { return ["reviewer"]; }
  async testConnection() { return { ok: true, message: "ok" }; }
  async getCapabilities(): Promise<ModelCapabilities> { return { streaming: true, tools: false, strictJsonSchema: true, promptCaching: false, accurateUsage: true }; }
  async generate(request: GenerateRequest): Promise<GenerateResponse> { return { id: request.taskId, text: JSON.stringify(this.response), finishReason: "stop", usage: {} }; }
  async *stream(): AsyncIterable<StreamEvent> { yield { type: "done", finishReason: "stop" }; }
}

const sources = [
  { id: "chapter", kind: "chapter_text" as const, text: "十分钟后抵达北岸。" },
  { id: "canon", kind: "canon" as const, text: "横渡海湾的航程至少两小时。" },
];

test("accepts only evidence quotes contained in known sources", async () => {
  const report = await runConsistencyReview({ projectId: "p1", chapterPlanId: "c1", provider: new ReviewProvider(), model: "reviewer", sources });
  assert.equal(report.issues[0].kind, "timeline");
  assert.equal(report.issues[0].evidence.length, 2);
});

test("rejects fabricated or unknown evidence", async () => {
  const provider = new ReviewProvider();
  provider.response = { summary: "错误", confidence: 0.5, issues: [{ kind: "world", severity: "warning", title: "伪证", description: "无", evidence: [{ sourceId: "canon", quote: "不存在的规则" }], suggestion: "", repairCandidate: "" }] };
  await assert.rejects(() => runConsistencyReview({ projectId: "p1", chapterPlanId: "c1", provider, model: "reviewer", sources }), /引文不在/);
});
