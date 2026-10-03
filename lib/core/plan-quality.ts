import type { StoryPlan } from "./story-plan.ts";

export type PlanQualitySeverity = "info" | "warning" | "error";

export interface PlanQualityIssue {
  id: string;
  severity: PlanQualitySeverity;
  title: string;
  description: string;
  chapterNumbers: number[];
}

export function inspectStoryPlan(plan: StoryPlan): PlanQualityIssue[] {
  const issues: PlanQualityIssue[] = [];
  const chapters = plan.volumes.flatMap((volume) => volume.chapters).sort((a, b) => a.number - b.number);
  const chapterNumbers = chapters.map((chapter) => chapter.number);
  chapterNumbers.forEach((number, index) => {
    const expected = index + 1;
    if (number !== expected) issues.push({ id: `chapter-gap-${number}-${expected}`, severity: "error", title: "章节编号不连续", description: `第 ${expected} 章位置出现第 ${number} 章，后续上下文和导出顺序可能错位。`, chapterNumbers: [number] });
  });
  for (const volume of plan.volumes) {
    const sceneWords = volume.chapters.reduce((sum, chapter) => sum + chapter.scenes.reduce((inner, scene) => inner + scene.targetWords, 0), 0);
    if (Math.abs(sceneWords - volume.targetWords) > Math.max(500, volume.targetWords * 0.2)) issues.push({ id: `volume-words-${volume.id}`, severity: "warning", title: `第 ${volume.number} 卷目标字数偏差`, description: `卷目标 ${volume.targetWords.toLocaleString()} 字，但场景目标合计 ${sceneWords.toLocaleString()} 字，偏差超过 20%。`, chapterNumbers: volume.chapters.map((chapter) => chapter.number) });
  }
  for (let index = 0; index < chapters.length - 2; index += 1) {
    const window = chapters.slice(index, index + 3);
    const noConflict = window.filter((chapter) => chapter.conflict.trim().length < 8).length;
    const noHook = window.filter((chapter) => chapter.hook.trim().length < 8).length;
    if (noConflict >= 2 && noHook >= 2) issues.push({ id: `rhythm-${window[0].number}`, severity: "warning", title: "连续章节推进信号偏弱", description: `第 ${window[0].number}—${window[window.length - 1].number} 章中，冲突或章节钩子描述较弱，建议补充转折、风险或未决问题。`, chapterNumbers: window.map((chapter) => chapter.number) });
  }
  for (let index = 0; index < chapters.length - 1; index += 1) {
    const current = chapters[index];
    const next = chapters[index + 1];
    if (current.location === next.location && current.time === next.time && current.pov === next.pov && current.scenes.length === 1 && next.scenes.length === 1) issues.push({ id: `static-${current.number}`, severity: "info", title: "连续章节场景变化较少", description: `第 ${current.number}、${next.number} 章视角、时间、地点和场景数量均相同，建议确认是否需要拆分或增加节奏变化。`, chapterNumbers: [current.number, next.number] });
  }
  return issues;
}
