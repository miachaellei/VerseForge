import assert from "node:assert/strict";
import test from "node:test";
import { decodeText, importTextDocument } from "./importer.ts";

test("imports UTF-8 text and creates stable chapters, segments, and source hash", async () => {
  const text = "序章\n\n雾从港口升起。\n\n第一章 归来\n\n林栀回到故乡。\n她收到一封信。\n\n第二章 潮汐\n\n潮汐表被人改过。";
  const input = { projectId: "project-1", fileName: "novel.txt", bytes: new TextEncoder().encode(text), importedAt: "2026-09-28T00:00:00.000Z" };
  const first = await importTextDocument(input);
  const second = await importTextDocument(input);

  assert.equal(first.document.originalText, text);
  assert.equal(first.document.sha256.length, 64);
  assert.equal(first.document.encoding, "utf-8");
  assert.deepEqual(first.chapters.map((chapter) => chapter.title), ["序章", "第一章 归来", "第二章 潮汐"]);
  assert.equal(first.chapters[1].content, "林栀回到故乡。\n她收到一封信。");
  assert.ok(first.segments.length >= 3);
  assert.equal(first.document.id, second.document.id);
  assert.deepEqual(first.chapters.map((chapter) => chapter.id), second.chapters.map((chapter) => chapter.id));
});

test("keeps leading content and reports short chapters", async () => {
  const text = "作品说明\n\n这是说明。\n\n第一章 开始\n\n很短。";
  const result = await importTextDocument({ projectId: "project-2", fileName: "novel.txt", bytes: new TextEncoder().encode(text) });

  assert.equal(result.chapters[0].title, "章节前内容");
  assert.equal(result.chapters[1].title, "第一章 开始");
  assert.ok(result.issues.some((issue) => issue.code === "VERY_SHORT_CHAPTER"));
});

test("falls back to one chapter when no heading is present", async () => {
  const text = "这是一段没有章节标题的正文。";
  const result = await importTextDocument({ projectId: "project-3", fileName: "plain.txt", bytes: new TextEncoder().encode(text) });

  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].title, "正文");
  assert.ok(result.issues.some((issue) => issue.code === "NO_CHAPTER_HEADINGS"));
});

test("recognizes UTF-8 BOM", () => {
  const payload = new TextEncoder().encode("测试");
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...payload]);
  assert.deepEqual(decodeText(bytes), { text: "测试", encoding: "utf-8-bom" });
});

