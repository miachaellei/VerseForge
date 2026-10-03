import assert from "node:assert/strict";
import test from "node:test";
import { assembleContext, estimateTokens } from "./context-assembler.ts";

test("isolates future facts, passages, and other projects", async () => {
  const snapshot = await assembleContext({
    projectId: "project-1",
    targetChapter: 10,
    maxInputTokens: 1_000,
    facts: [
      { id: "known", projectId: "project-1", kind: "character", text: "林栀知道港口发生过事故", validFromChapter: 2, revealedAtChapter: 2 },
      { id: "future-secret", projectId: "project-1", kind: "character", text: "周屿其实是目击者", validFromChapter: 1, revealedAtChapter: 11 },
      { id: "other-project", projectId: "project-2", kind: "world", text: "另一部小说的规则", validFromChapter: 1, revealedAtChapter: 1 },
    ],
    summaries: [{ id: "volume-1", projectId: "project-1", layer: "volume", text: "第一卷当前摘要", validFromChapter: 1, validThroughChapter: 12 }],
    passages: [
      { id: "chapter-9", projectId: "project-1", chapterOrdinal: 9, text: "上一章片段", score: 0.9 },
      { id: "chapter-11", projectId: "project-1", chapterOrdinal: 11, text: "未来正文片段", score: 1 },
    ],
  });

  assert.deepEqual(snapshot.sources.map((source) => source.id), ["known", "volume-1", "chapter-9"]);
  assert.doesNotMatch(snapshot.prompt, /目击者|未来正文|另一部小说/);
  assert.equal(snapshot.targetChapter, 10);
});

test("honors validity ranges and token budget deterministically", async () => {
  const input = {
    projectId: "project-1",
    targetChapter: 6,
    maxInputTokens: 8,
    facts: [
      { id: "active", projectId: "project-1", kind: "item" as const, text: "钥匙仍在林栀手中", validFromChapter: 4, revealedAtChapter: 4, priority: 10 },
      { id: "expired", projectId: "project-1", kind: "item" as const, text: "钥匙仍在周屿手中", validFromChapter: 1, validThroughChapter: 3, revealedAtChapter: 1 },
    ],
    summaries: [],
    passages: [{ id: "long", projectId: "project-1", chapterOrdinal: 5, text: "这是一段会超出剩余预算的很长检索内容", score: 1 }],
  };
  const first = await assembleContext(input);
  const second = await assembleContext(input);
  assert.deepEqual(first.sources.map((source) => source.id), ["active"]);
  assert.equal(first.id, second.id);
  assert.ok(first.estimatedTokens <= input.maxInputTokens);
  assert.ok(estimateTokens("中文上下文") > 1);
});
