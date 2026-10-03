export interface ScenePlan {
  id: string;
  title: string;
  goal: string;
  location: string;
  characters: string[];
  entryState: string;
  action: string;
  conflict: string;
  exitState: string;
  targetWords: number;
}

export interface ChapterPlan {
  id: string;
  number: number;
  title: string;
  pov: string;
  time: string;
  location: string;
  goal: string;
  conflict: string;
  outcome: string;
  hook: string;
  targetWords: number;
  scenes: ScenePlan[];
}

export interface VolumePlan {
  id: string;
  number: number;
  title: string;
  goal: string;
  conflict: string;
  turningPoint: string;
  startState: string;
  endState: string;
  targetWords: number;
  chapters: ChapterPlan[];
}

export interface StoryPlan {
  version: 1;
  premise: string;
  structure: string;
  volumes: VolumePlan[];
}

export const STORY_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["premise", "structure", "volumes"],
  properties: {
    premise: { type: "string" },
    structure: { type: "string" },
    volumes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "title", "goal", "conflict", "turningPoint", "startState", "endState", "targetWords", "chapters"],
        properties: {
          number: { type: "integer", minimum: 1 },
          title: { type: "string" },
          goal: { type: "string" },
          conflict: { type: "string" },
          turningPoint: { type: "string" },
          startState: { type: "string" },
          endState: { type: "string" },
          targetWords: { type: "integer", minimum: 1 },
          chapters: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["number", "title", "pov", "time", "location", "goal", "conflict", "outcome", "hook", "targetWords", "scenes"],
              properties: {
                number: { type: "integer", minimum: 1 },
                title: { type: "string" },
                pov: { type: "string" },
                time: { type: "string" },
                location: { type: "string" },
                goal: { type: "string" },
                conflict: { type: "string" },
                outcome: { type: "string" },
                hook: { type: "string" },
                targetWords: { type: "integer", minimum: 1 },
                scenes: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "goal", "location", "characters", "entryState", "action", "conflict", "exitState", "targetWords"],
                    properties: {
                      title: { type: "string" },
                      goal: { type: "string" },
                      location: { type: "string" },
                      characters: { type: "array", items: { type: "string" } },
                      entryState: { type: "string" },
                      action: { type: "string" },
                      conflict: { type: "string" },
                      exitState: { type: "string" },
                      targetWords: { type: "integer", minimum: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function parseStoryPlanCandidate(value: unknown, projectId: string): StoryPlan {
  if (!projectId.trim() || !value || typeof value !== "object") throw new Error("故事规划缺少项目或结构无效");
  const root = value as Record<string, unknown>;
  if (typeof root.premise !== "string" || typeof root.structure !== "string" || !Array.isArray(root.volumes) || root.volumes.length === 0) throw new Error("故事规划缺少前提、结构或卷");
  const volumeNumbers = new Set<number>();
  const chapterNumbers = new Set<number>();
  const volumes = root.volumes.map((rawVolume): VolumePlan => {
    const volume = object(rawVolume, "卷");
    const number = positiveInteger(volume.number, "卷号");
    if (volumeNumbers.has(number)) throw new Error("故事规划包含重复卷号");
    volumeNumbers.add(number);
    const chaptersRaw = array(volume.chapters, "章节");
    if (!chaptersRaw.length) throw new Error("每卷至少包含一章");
    const chapters = chaptersRaw.map((rawChapter): ChapterPlan => {
      const chapter = object(rawChapter, "章节");
      const chapterNumber = positiveInteger(chapter.number, "章节号");
      if (chapterNumbers.has(chapterNumber)) throw new Error("故事规划包含重复章节号");
      chapterNumbers.add(chapterNumber);
      const scenesRaw = array(chapter.scenes, "场景");
      if (!scenesRaw.length) throw new Error("每章至少包含一个场景");
      const chapterKey = `${projectId}:${number}:${chapterNumber}`;
      const scenes = scenesRaw.map((rawScene, index): ScenePlan => {
        const scene = object(rawScene, "场景");
        return {
          id: stableId("scene", `${chapterKey}:${index + 1}:${string(scene.title, "场景标题")}`),
          title: string(scene.title, "场景标题"),
          goal: string(scene.goal, "场景目标"),
          location: string(scene.location, "场景地点"),
          characters: stringArray(scene.characters, "场景人物"),
          entryState: string(scene.entryState, "进入状态"),
          action: string(scene.action, "行动"),
          conflict: string(scene.conflict, "场景冲突"),
          exitState: string(scene.exitState, "退出状态"),
          targetWords: positiveInteger(scene.targetWords, "场景目标字数"),
        };
      });
      return {
        id: stableId("chapter_plan", chapterKey),
        number: chapterNumber,
        title: string(chapter.title, "章节标题"),
        pov: string(chapter.pov, "章节视角"),
        time: string(chapter.time, "章节时间"),
        location: string(chapter.location, "章节地点"),
        goal: string(chapter.goal, "章节目标"),
        conflict: string(chapter.conflict, "章节冲突"),
        outcome: string(chapter.outcome, "章节结果"),
        hook: string(chapter.hook, "章节钩子"),
        targetWords: positiveInteger(chapter.targetWords, "章节目标字数"),
        scenes,
      };
    });
    return {
      id: stableId("volume", `${projectId}:${number}`),
      number,
      title: string(volume.title, "卷标题"),
      goal: string(volume.goal, "卷目标"),
      conflict: string(volume.conflict, "卷冲突"),
      turningPoint: string(volume.turningPoint, "卷转折"),
      startState: string(volume.startState, "卷起始状态"),
      endState: string(volume.endState, "卷结束状态"),
      targetWords: positiveInteger(volume.targetWords, "卷目标字数"),
      chapters,
    };
  });
  return { version: 1, premise: root.premise.trim(), structure: root.structure.trim(), volumes };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}结构无效`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label}结构无效`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}不能为空`);
  return value.trim();
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label}结构无效`);
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new Error(`${label}必须是正整数`);
  return value;
}

function stableId(namespace: string, value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `${namespace}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
