import { sha256Hex } from "./hash.ts";

export interface FieldLock {
  path: string;
  label: string;
  valueHash: string;
  lockedAt: string;
}

export interface RewriteFieldChange {
  path: string;
  label: string;
  before: string;
  after: string;
  locked: boolean;
}

export interface ImpactReference {
  id: string;
  title: string;
  reason: string;
}

export interface RewriteImpactReport {
  changes: RewriteFieldChange[];
  volumes: ImpactReference[];
  chapters: ImpactReference[];
  characters: ImpactReference[];
  drafts: ImpactReference[];
}

type FlatRecord = Record<string, unknown>;

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

export async function createFieldLock(path: string, label: string, value: unknown): Promise<FieldLock> {
  if (!path.trim()) throw new Error("锁定字段路径不能为空");
  return { path, label: label.trim() || path, valueHash: await sha256Hex(stringify(value)), lockedAt: new Date().toISOString() };
}

export function diffRecordFields(prefix: string, labels: Record<string, string>, current: FlatRecord, candidate: FlatRecord, locks: FieldLock[]): RewriteFieldChange[] {
  return Object.keys(labels).flatMap((key) => {
    const before = stringify(current[key]);
    const after = stringify(candidate[key]);
    if (before === after) return [];
    const path = `${prefix}.${key}`;
    return [{ path, label: labels[key], before, after, locked: locks.some((lock) => lock.path === path) }];
  });
}

export function preserveLockedFields<T extends FlatRecord>(prefix: string, current: T, candidate: T, locks: FieldLock[]): T {
  const result: FlatRecord = { ...candidate };
  for (const lock of locks) {
    const marker = `${prefix}.`;
    if (!lock.path.startsWith(marker)) continue;
    const key = lock.path.slice(marker.length);
    if (key && Object.prototype.hasOwnProperty.call(current, key)) result[key] = current[key];
  }
  return result as T;
}

function searchable(value: unknown): string {
  return stringify(value).toLocaleLowerCase("zh-CN");
}

function changedTerms(changes: RewriteFieldChange[]): string[] {
  return [...new Set(changes.flatMap((change) => [change.before, change.after]).flatMap((value) => value.split(/[\s，。；、：,.!?！？;:"“”'‘’（）()《》]+/)).map((value) => value.trim().toLocaleLowerCase("zh-CN")).filter((value) => value.length >= 2))];
}

function reasonFor(value: unknown, terms: string[]): string | null {
  const haystack = searchable(value);
  const matches = terms.filter((term) => haystack.includes(term)).slice(0, 3);
  return matches.length ? `引用了变更内容：${matches.join("、")}` : null;
}

export function analyzeRewriteImpact(input: {
  changes: RewriteFieldChange[];
  storyPlan: { volumes: Array<{ id: string; title: string; goal?: unknown; conflict?: unknown; turningPoint?: unknown; startState?: unknown; endState?: unknown; chapters: Array<{ id: string; number: number; title: string; goal?: unknown; conflict?: unknown; outcome?: unknown; hook?: unknown; pov?: unknown; time?: unknown; location?: unknown; scenes?: unknown }> }> };
  characters: Array<{ id: string | number; name: string; role?: unknown; personality?: unknown; goal?: unknown; secret?: unknown }>;
  drafts: Array<{ id: string; chapterPlanId: string; title: string; content: string }>;
}): RewriteImpactReport {
  const terms = changedTerms(input.changes);
  const chapters: ImpactReference[] = [];
  const volumes = input.storyPlan.volumes.flatMap((volume) => {
    const directReason = reasonFor({ ...volume, chapters: undefined }, terms);
    for (const chapter of volume.chapters) {
      const reason = reasonFor(chapter, terms);
      if (reason) chapters.push({ id: chapter.id, title: `第 ${chapter.number} 章 · ${chapter.title}`, reason });
    }
    const affectedChildren = chapters.filter((chapter) => volume.chapters.some((item) => item.id === chapter.id)).length;
    return directReason || affectedChildren ? [{ id: volume.id, title: volume.title, reason: directReason ?? `${affectedChildren} 个章节引用了变更内容` }] : [];
  });
  const characters = input.characters.flatMap((character) => {
    const reason = reasonFor(character, terms);
    return reason ? [{ id: String(character.id), title: character.name, reason }] : [];
  });
  const chapterNumbers = new Map(input.storyPlan.volumes.flatMap((volume) => volume.chapters.map((chapter) => [chapter.id, chapter.number] as const)));
  const drafts = input.drafts.flatMap((draft) => {
    const reason = reasonFor(draft.content, terms);
    return reason ? [{ id: draft.id, title: `第 ${chapterNumbers.get(draft.chapterPlanId) ?? "?"} 章 · ${draft.title}`, reason }] : [];
  });
  return { changes: input.changes, volumes, chapters, characters, drafts };
}
