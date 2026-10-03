import assert from "node:assert/strict";
import test from "node:test";
import { parseStoryPlanCandidate } from "./story-plan.ts";

const value = {
  premise: "调查旧案",
  structure: "三幕式",
  volumes: [{
    number: 1, title: "归港", goal: "找到第一条证据", conflict: "地方势力阻拦", turningPoint: "证人失踪", startState: "主角离乡", endState: "主角决定留下", targetWords: 50_000,
    chapters: [{
      number: 1, title: "来信", pov: "林栀", time: "第一天清晨", location: "旧邮局", goal: "确认信件来源", conflict: "邮局已封闭", outcome: "找到暗门", hook: "门后传来钟声", targetWords: 4_000,
      scenes: [{ title: "门缝里的信", goal: "检查信件", location: "旧邮局门口", characters: ["林栀"], entryState: "犹豫", action: "检查信封", conflict: "有人监视", exitState: "决定进入邮局", targetWords: 1_200 }],
    }],
  }],
};

test("validates a nested volume/chapter/scene plan and generates stable ids", () => {
  const plan = parseStoryPlanCandidate(value, "project-1");
  assert.equal(plan.volumes[0].chapters[0].scenes[0].targetWords, 1_200);
  assert.equal(plan.volumes[0].id, parseStoryPlanCandidate(value, "project-1").volumes[0].id);
  assert.notEqual(plan.volumes[0].id, parseStoryPlanCandidate(value, "project-2").volumes[0].id);
});

test("rejects duplicate chapter numbers and missing scenes", () => {
  const duplicated = structuredClone(value);
  duplicated.volumes[0].chapters.push(structuredClone(duplicated.volumes[0].chapters[0]));
  assert.throws(() => parseStoryPlanCandidate(duplicated, "project-1"), /重复章节号/);
  const noScenes = structuredClone(value);
  noScenes.volumes[0].chapters[0].scenes = [];
  assert.throws(() => parseStoryPlanCandidate(noScenes, "project-1"), /至少包含一个场景/);
});
