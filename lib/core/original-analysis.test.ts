import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateRequest, GenerateResponse, ModelCapabilities, ModelProvider, StreamEvent } from "./model-provider.ts";
import { analyzeOriginalChapters, estimateOriginalAnalysis, type ChapterAnalysis } from "./original-analysis.ts";
import type { SourceChapter, SourceSegment } from "./types.ts";

class AnalysisProvider implements ModelProvider {
  readonly id = "test";
  readonly protocol = "openai-compatible" as const;
  calls: GenerateRequest[] = [];
  async listModels() { return ["writer"]; }
  async testConnection() { return { ok: true, message: "ok" }; }
  async getCapabilities(): Promise<ModelCapabilities> { return { streaming: true, tools: true, strictJsonSchema: true, promptCaching: false, accurateUsage: true }; }
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    this.calls.push(request);
    const data = JSON.parse(request.messages[1].content) as { sourceData: Array<{ segmentId: string }> };
    return { id: request.taskId, text: JSON.stringify({ summary: "本章摘要", goals: ["查明真相"], conflicts: ["遭到阻拦"], outcomes: ["获得线索"], stateChanges: [{ subject: "林栀", field: "knowledge", before: "未知", after: "得知码头编号" }], characters: ["林栀"], locations: ["旧港"], worldTerms: ["潮汐钟"], relationships: [{ source: "林栀", target: "陈河", type: "盟友", description: "共同追查" }], timelineEvents: [{ title: "获得线索", description: "林栀找到码头编号", timeMarker: "当夜" }], worldRules: [{ name: "潮汐钟", description: "涨潮时响起" }], foreshadowing: [{ setup: "码头编号", possiblePayoff: "指向失踪船只" }], evidence: [{ claim: "林栀获得码头线索", segmentIds: [data.sourceData[0].segmentId] }], confidence: 0.9, uncertainties: [] }), finishReason: "stop", usage: {} };
  }
  async *stream(): AsyncIterable<StreamEvent> { yield { type: "done", finishReason: "stop" }; }
}

const chapters: SourceChapter[] = [
  { id: "chapter-1", sourceDocumentId: "source-1", ordinal: 0, title: "第一章", content: "雾起。", startOffset: 0, endOffset: 3 },
  { id: "chapter-2", sourceDocumentId: "source-1", ordinal: 1, title: "第二章", content: "归港。", startOffset: 4, endOffset: 7 },
];
const segments: SourceSegment[] = chapters.map((chapter, index) => ({ id: `segment-${index + 1}`, sourceDocumentId: "source-1", chapterId: chapter.id, ordinal: 0, content: chapter.content, startOffset: chapter.startOffset, endOffset: chapter.endOffset }));

test("estimates and analyzes chapters with evidence while resuming completed work", async () => {
  assert.deepEqual(estimateOriginalAnalysis(chapters, segments), { chapters: 2, segments: 2, estimatedInputTokens: 4, modelCalls: 2 });
  const provider = new AnalysisProvider();
  const completed = new Map<string, ChapterAnalysis>([["chapter-1", { chapterId: "chapter-1", summary: "已有结果", goals: [], conflicts: [], outcomes: [], stateChanges: [], characters: [], locations: [], worldTerms: [], relationships: [], timelineEvents: [], worldRules: [], foreshadowing: [], evidence: [], confidence: 1, uncertainties: [], status: "draft" }]]);
  const progress: number[] = [];
  const result = await analyzeOriginalChapters({ projectId: "project-1", chapters, segments, provider, model: "writer", completed, onProgress: (event) => progress.push(event.completed) });
  assert.equal(provider.calls.length, 1);
  assert.equal(result.size, 2);
  assert.deepEqual(result.get("chapter-2")?.evidence[0].segmentIds, ["segment-2"]);
  assert.deepEqual(progress, [2]);
  assert.match(provider.calls[0].messages[0].content, /纯数据/);
});

test("rejects evidence that points outside the current chapter", async () => {
  const provider = new AnalysisProvider();
  provider.generate = async (request) => ({ id: request.taskId, text: JSON.stringify({ summary: "错误", goals: [], conflicts: [], outcomes: [], stateChanges: [], characters: [], locations: [], worldTerms: [], relationships: [], timelineEvents: [], worldRules: [], foreshadowing: [], evidence: [{ claim: "越界", segmentIds: ["segment-2"] }], confidence: 0.5, uncertainties: [] }), finishReason: "stop", usage: {} });
  await assert.rejects(() => analyzeOriginalChapters({ projectId: "project-1", chapters: [chapters[0]], segments, provider, model: "writer" }), /当前章节之外/);
});
