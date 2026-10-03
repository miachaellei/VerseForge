import assert from "node:assert/strict";
import test from "node:test";
import { importTextDocument } from "./importer.ts";
import { mergeSourceChapterWithNext, moveSourceChapter, previewSourceCleaning, renameSourceChapter, splitSourceChapter } from "./source-snapshot-editor.ts";

async function fixture() {
  const text = `第1章 起点\n小说站广告\n正文第一行\n正文第二行\n- 1 -\n\n第2章 继续\n小说站广告\n第二章正文\n第二章正文\n- 2 -\n\n第3章 终点\n小说站广告\n第三章正文\n- 3 -`;
  return importTextDocument({ projectId: "project-1", fileName: "novel.txt", bytes: new TextEncoder().encode(text), importedAt: "2026-01-01T00:00:00.000Z" });
}

test("cleaning preview removes repeated boundary lines page numbers and duplicate paragraphs without changing raw text", async () => {
  const source = await fixture();
  const preview = await previewSourceCleaning(source, { removePageNumbers: true, removeRepeatedHeadersFooters: true, deduplicateConsecutiveParagraphs: true, joinPdfHardWraps: false, blockedLineFragments: ["小说站广告"] });
  assert.equal(preview.source.document.originalText, source.document.originalText);
  assert.ok(preview.removedLines >= 5);
  assert.equal(preview.source.chapters.some((chapter) => chapter.content.includes("小说站广告")), false);
  assert.equal(preview.source.chapters[1].content.match(/第二章正文/g)?.length, 1);
  assert.equal(new Set(preview.source.segments.map((segment) => segment.id)).size, preview.source.segments.length);
});

test("chapter split merge rename and reorder rebuild stable ordinals", async () => {
  const source = await fixture();
  const first = source.chapters[0];
  const split = await splitSourceChapter(source, first.id, Math.floor(first.content.length / 2), "第一章下");
  assert.equal(split.chapters.length, 4);
  const merged = await mergeSourceChapterWithNext(split, split.chapters[0].id);
  assert.equal(merged.chapters.length, 3);
  const renamed = await renameSourceChapter(merged, merged.chapters[0].id, "新标题");
  const moved = await moveSourceChapter(renamed, renamed.chapters[0].id, 1);
  assert.equal(moved.chapters[1].title, "新标题");
  assert.deepEqual(moved.chapters.map((chapter) => chapter.ordinal), [0, 1, 2]);
  assert.ok(moved.segments.every((segment) => moved.chapters.some((chapter) => chapter.id === segment.chapterId)));
});
