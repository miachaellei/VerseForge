import assert from "node:assert/strict";
import test from "node:test";
import type { ChapterAnalysis } from "./original-analysis.ts";
import { buildSourceCanon } from "./source-canon.ts";
import type { SourceChapter } from "./types.ts";

const chapters: SourceChapter[] = [
  { id: "c1", sourceDocumentId: "s1", ordinal: 0, title: "第一章", content: "", startOffset: 0, endOffset: 10 },
  { id: "c2", sourceDocumentId: "s1", ordinal: 1, title: "第二章", content: "", startOffset: 11, endOffset: 20 },
];

function analysis(chapterId: string, confidence: number): ChapterAnalysis {
  return {
    chapterId,
    summary: "摘要",
    goals: [],
    conflicts: [],
    outcomes: [],
    stateChanges: [],
    characters: ["林栀"],
    locations: ["旧港"],
    worldTerms: ["潮汐钟"],
    relationships: [{ source: "林栀", target: "陈河", type: "盟友", description: chapterId === "c1" ? "初次合作" : "共同追查" }],
    timelineEvents: [{ title: "码头调查", description: "找到线索", timeMarker: chapterId === "c1" ? "第一天" : "次日" }],
    worldRules: [{ name: "潮汐钟", description: "涨潮时响起" }],
    foreshadowing: [{ setup: "被刮去的船号", possiblePayoff: "指向失踪船" }],
    evidence: [{ claim: "林栀在旧港调查潮汐钟和码头线索", segmentIds: [`${chapterId}-segment`] }],
    confidence,
    uncertainties: chapterId === "c2" ? ["次日是否为严格日历日"] : [],
    status: "draft",
  };
}

test("aggregates reviewed chapter facts into stable evidence-backed source canon", () => {
  const canon = buildSourceCanon(chapters, [analysis("c2", 0.8), analysis("c1", 0.9)], "2026-01-01T00:00:00.000Z");
  assert.equal(canon.chapterCount, 2);
  assert.equal(canon.entities.find((entity) => entity.name === "林栀")?.mentionCount, 2);
  assert.deepEqual(canon.entities.find((entity) => entity.name === "林栀")?.chapterIds, ["c1", "c2"]);
  assert.equal(canon.relationships.length, 1);
  assert.deepEqual(canon.relationships[0].descriptions, ["初次合作", "共同追查"]);
  assert.deepEqual(canon.timeline.map((event) => event.chapterId), ["c1", "c2"]);
  assert.equal(canon.worldRules[0].chapterIds.length, 2);
  assert.equal(canon.uncertainties.length, 1);
  assert.equal(canon.entities[0].id, buildSourceCanon(chapters, [analysis("c1", 0.9)]).entities[0].id);
});

test("accepts legacy chapter analyses that do not contain the expanded fields", () => {
  const current = analysis("c1", 0.9);
  const { relationships: _r, timelineEvents: _t, worldRules: _w, foreshadowing: _f, ...legacy } = current;
  void [_r, _t, _w, _f];
  const canon = buildSourceCanon(chapters, [legacy]);
  assert.equal(canon.entities.length, 3);
  assert.equal(canon.relationships.length, 0);
  assert.equal(canon.timeline.length, 0);
});
