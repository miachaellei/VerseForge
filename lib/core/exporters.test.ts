import assert from "node:assert/strict";
import test from "node:test";
import { exportDocx, exportMarkdown, exportPlainText, exportProjectPackage, importProjectPackage } from "./exporters.ts";

const chapters = [{ number: 1, title: "归港", content: "雾起。\n\n她回来了。" }];

test("exports ordered plain text and markdown", () => {
  assert.match(exportPlainText("雾港来信", chapters), /第1章 归港/);
  assert.match(exportMarkdown("雾港来信", chapters), /^# 雾港来信[\s\S]*## 第1章 归港/);
});

test("exports valid ZIP-shaped DOCX and project packages", () => {
  const docx = exportDocx("雾港来信", chapters);
  const backup = exportProjectPackage({ appVersion: "0.1.0", project: { id: "p1" }, storyBible: {}, storyPlan: { version: 1, premise: "", structure: "", volumes: [] }, chapters, sourceManifest: [], database: { chapterVersions: [{ revision: 1 }] }, sources: [{ document: { id: "source-1" } }] });
  assert.equal(new DataView(docx.buffer, docx.byteOffset).getUint32(0, true), 0x04034b50);
  assert.equal(new DataView(backup.buffer, backup.byteOffset).getUint32(0, true), 0x04034b50);
  assert.ok(docx.length > 1_000);
  const imported = importProjectPackage(backup);
  assert.equal((imported.manifest.project as { id: string }).id, "p1");
  assert.equal(imported.chapters[0].content, chapters[0].content);
  assert.deepEqual(imported.database.chapterVersions, [{ revision: 1 }]);
});
