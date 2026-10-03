import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRewriteImpact, createFieldLock, diffRecordFields, preserveLockedFields } from "./rewrite-governance.ts";

test("locked fields are preserved while unlocked candidate fields remain", async () => {
  const current = { theme: "记忆", ending: "返乡" };
  const lock = await createFieldLock("synopsis.ending", "结局", current.ending);
  assert.deepEqual(preserveLockedFields("synopsis", current, { theme: "身份", ending: "远走" }, [lock]), { theme: "身份", ending: "返乡" });
  const changes = diffRecordFields("synopsis", { theme: "主题", ending: "结局" }, current, { theme: "身份", ending: "远走" }, [lock]);
  assert.equal(changes.find((item) => item.path === "synopsis.ending")?.locked, true);
});

test("impact analysis locates affected volumes chapters characters and drafts", () => {
  const changes = [{ path: "synopsis.theme", label: "主题", before: "寻找父亲", after: "寻找真相", locked: false }];
  const report = analyzeRewriteImpact({
    changes,
    storyPlan: { volumes: [{ id: "v1", title: "第一卷", goal: "寻找父亲", chapters: [{ id: "c1", number: 1, title: "启程", goal: "寻找父亲" }] }] },
    characters: [{ id: 1, name: "周屿", goal: "寻找父亲" }],
    drafts: [{ id: "d1", chapterPlanId: "c1", title: "启程", content: "周屿决定寻找父亲。" }],
  });
  assert.equal(report.volumes.length, 1);
  assert.equal(report.chapters.length, 1);
  assert.equal(report.characters.length, 1);
  assert.equal(report.drafts.length, 1);
});
