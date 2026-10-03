import assert from "node:assert/strict";
import test from "node:test";
import { assembleContext } from "./context-assembler.ts";
import { importTextDocument } from "./importer.ts";
import { analyzeOriginalChapters } from "./original-analysis.ts";
import { inspectStoryPlan } from "./plan-quality.ts";
import { buildSourceCanon } from "./source-canon.ts";
import type { ModelProvider } from "./model-provider.ts";
import { parseStoryPlanCandidate } from "./story-plan.ts";

const provider: ModelProvider = {
  id: "pipeline-test",
  protocol: "openai-compatible",
  async listModels() { return ["test-model"]; },
  async testConnection() { return { ok: true, message: "ok" }; },
  async getCapabilities() { return { streaming: true, tools: true, strictJsonSchema: true, promptCaching: false, accurateUsage: true }; },
  async generate(request) {
    const chapter = request.messages[1]?.content.match(/"id":"([^"]+)"/)?.[1] ?? "unknown";
    const segmentId = request.messages[1]?.content.match(/"segmentId":"([^"]+)"/)?.[1] ?? "missing";
    return {
      id: `analysis-${chapter}`,
      text: JSON.stringify({
        summary: `第${chapter}章推进主线`, goals: ["查明线索"], conflicts: ["线索被阻断"], outcomes: ["获得新线索"],
        stateChanges: [{ subject: "林栀", field: "掌握线索", before: "无", after: "获得旧信件" }],
        characters: ["林栀"], locations: ["临江码头"], worldTerms: ["潮汐档案"],
        relationships: [{ source: "林栀", target: "周屿", type: "合作", description: "暂时合作" }],
        timelineEvents: [{ title: "发现信件", description: "在码头发现旧信件", timeMarker: "当晚" }],
        worldRules: [{ name: "档案规则", description: "档案只能在涨潮时读取" }],
        foreshadowing: [{ setup: "信件缺少落款", possiblePayoff: "指向失踪者" }],
        evidence: [{ claim: "获得旧信件", segmentIds: [segmentId] }], confidence: 0.9, uncertainties: [],
      }), finishReason: "stop", usage: { inputTokens: 30, outputTokens: 40 },
    };
  },
  async *stream() { yield { type: "done", finishReason: "stop" as const }; },
};

test("first-phase pipeline connects import, analysis, canon, plan, and future-safe context", async () => {
  const source = await importTextDocument({ projectId: "pipeline-project", fileName: "novel.txt", bytes: new TextEncoder().encode("第一章\n林栀在临江码头找到线索。\n第二章\n周屿带来旧信件。") });
  const analyses = await analyzeOriginalChapters({ projectId: "pipeline-project", chapters: source.chapters, segments: source.segments, provider, model: "test-model" });
  assert.equal(analyses.size, 2);
  const canon = buildSourceCanon(source.chapters, [...analyses.values()], "2026-09-30T00:00:00.000Z");
  assert.equal(canon.chapterCount, 2);
  assert.ok(canon.entities.some((item) => item.name === "林栀"));
  assert.ok(canon.relationships.length > 0);

  const plan = parseStoryPlanCandidate({ premise: "追查失踪案", structure: "三幕", volumes: [{ number: 1, title: "潮汐", goal: "找到线索", conflict: "被阻断", turningPoint: "发现档案", startState: "未知", endState: "掌握线索", targetWords: 2000, chapters: [1, 2].map((number) => ({ number, title: `第${number}章`, pov: "林栀", time: `第${number}晚`, location: "临江码头", goal: "查线索", conflict: "有人阻拦", outcome: "获得信息", hook: "出现新疑点", targetWords: 1000, scenes: [{ title: "码头调查", goal: "寻找证据", location: "临江码头", characters: ["林栀"], entryState: "无证据", action: "搜索", conflict: "线索被阻断", exitState: "得到线索", targetWords: 1000 }] })) }] }, "pipeline-project");
  assert.equal(inspectStoryPlan(plan).filter((issue) => issue.severity === "error").length, 0);

  const context = await assembleContext({ projectId: "pipeline-project", targetChapter: 2, maxInputTokens: 200, facts: [{ id: "fact-future", projectId: "pipeline-project", kind: "timeline", text: "第三章才揭示的真相", validFromChapter: 3, revealedAtChapter: 3 }, { id: "fact-current", projectId: "pipeline-project", kind: "character", text: "林栀已拿到旧信件", validFromChapter: 2, revealedAtChapter: 1 }], summaries: [], passages: [{ id: "passage-1", projectId: "pipeline-project", chapterOrdinal: 1, text: "第二章旧信件", score: 1 }] });
  assert.match(context.prompt, /旧信件/);
  assert.doesNotMatch(context.prompt, /第三章才揭示/);
});
