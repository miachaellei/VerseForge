import assert from "node:assert/strict";
import test from "node:test";
import { inspectStoryPlan } from "./plan-quality.ts";
import type { StoryPlan } from "./story-plan.ts";

const scene = (title: string, targetWords = 1000) => ({ id: title, title, goal: "推进", location: "地点", characters: ["甲"], entryState: "开始", action: "行动", conflict: "冲突", exitState: "结果", targetWords });
const plan: StoryPlan = { version: 1, premise: "前提", structure: "三幕", volumes: [{ id: "v1", number: 1, title: "第一卷", goal: "目标", conflict: "冲突", turningPoint: "转折", startState: "起点", endState: "终点", targetWords: 5000, chapters: [1, 3].map((number) => ({ id: `c${number}`, number, title: `第${number}章`, pov: "甲", time: "夜", location: "地点", goal: "目标", conflict: number === 1 ? "" : "冲突", outcome: "结果", hook: number === 1 ? "" : "钩子", targetWords: 1000, scenes: [scene(`s${number}`)] })) }] };

test("detects chapter gaps and rhythm warnings", () => {
  const issues = inspectStoryPlan(plan);
  assert.ok(issues.some((issue) => issue.title === "章节编号不连续"));
  assert.ok(issues.some((issue) => issue.title === "第 1 卷目标字数偏差"));
});

test("returns no issue for a balanced minimal plan", () => {
  const balanced: StoryPlan = { ...plan, volumes: [{ ...plan.volumes[0], targetWords: 2000, chapters: [1, 2].map((number) => ({ ...plan.volumes[0].chapters[0], id: `c${number}`, number, conflict: "明确冲突", hook: "明确钩子", scenes: [scene(`s${number}`, 1000)] })) }] };
  assert.equal(inspectStoryPlan(balanced).filter((issue) => issue.severity === "error").length, 0);
});
