import type { ChapterAnalysis } from "./original-analysis.ts";
import type { SourceChapter } from "./types.ts";

export type CanonEntityKind = "character" | "location" | "world_term";

export interface SourceCanonEntity {
  id: string;
  kind: CanonEntityKind;
  name: string;
  chapterIds: string[];
  mentionCount: number;
  evidenceSegmentIds: string[];
  confidence: number;
}

export interface SourceCanonRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  descriptions: string[];
  chapterIds: string[];
  evidenceSegmentIds: string[];
  confidence: number;
}

export interface SourceCanonTimelineEvent {
  id: string;
  chapterId: string;
  chapterOrdinal: number;
  chapterTitle: string;
  title: string;
  description: string;
  timeMarker: string;
  evidenceSegmentIds: string[];
  confidence: number;
}

export interface SourceCanon {
  version: 1;
  generatedAt: string;
  chapterCount: number;
  entities: SourceCanonEntity[];
  relationships: SourceCanonRelationship[];
  timeline: SourceCanonTimelineEvent[];
  worldRules: Array<{ id: string; name: string; descriptions: string[]; chapterIds: string[]; evidenceSegmentIds: string[]; confidence: number }>;
  foreshadowing: Array<{ id: string; setup: string; possiblePayoff: string; chapterId: string; evidenceSegmentIds: string[]; confidence: number }>;
  uncertainties: Array<{ chapterId: string; text: string }>;
}

type AnalysisInput = Pick<ChapterAnalysis, "chapterId" | "characters" | "locations" | "worldTerms" | "evidence" | "confidence" | "uncertainties"> & Partial<Pick<ChapterAnalysis, "relationships" | "timelineEvents" | "worldRules" | "foreshadowing">>;

export function buildSourceCanon(chapters: SourceChapter[], analyses: AnalysisInput[], generatedAt = new Date().toISOString()): SourceCanon {
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const ordered = analyses
    .filter((analysis) => chapterById.has(analysis.chapterId))
    .sort((left, right) => (chapterById.get(left.chapterId)?.ordinal ?? 0) - (chapterById.get(right.chapterId)?.ordinal ?? 0));
  const entities = new Map<string, SourceCanonEntity>();
  const relationships = new Map<string, SourceCanonRelationship>();
  const worldRules = new Map<string, SourceCanon["worldRules"][number]>();
  const timeline: SourceCanonTimelineEvent[] = [];
  const foreshadowing: SourceCanon["foreshadowing"] = [];
  const uncertainties: SourceCanon["uncertainties"] = [];

  for (const analysis of ordered) {
    const chapter = chapterById.get(analysis.chapterId)!;
    const evidenceSegmentIds = unique(analysis.evidence.flatMap((item) => item.segmentIds));
    for (const [kind, names] of [["character", analysis.characters], ["location", analysis.locations], ["world_term", analysis.worldTerms]] as const) {
      for (const rawName of names) {
        const name = rawName.trim();
        if (!name) continue;
        const key = `${kind}:${normalize(name)}`;
        const current = entities.get(key) ?? { id: stableId("entity", key), kind, name, chapterIds: [], mentionCount: 0, evidenceSegmentIds: [], confidence: 0 };
        current.mentionCount += 1;
        current.chapterIds = unique([...current.chapterIds, analysis.chapterId]);
        current.evidenceSegmentIds = unique([...current.evidenceSegmentIds, ...evidenceFor(name, analysis)]);
        current.confidence = Math.max(current.confidence, analysis.confidence);
        entities.set(key, current);
      }
    }
    for (const item of analysis.relationships ?? []) {
      const source = item.source.trim();
      const target = item.target.trim();
      const type = item.type.trim();
      if (!source || !target || !type) continue;
      const key = `${normalize(source)}:${normalize(target)}:${normalize(type)}`;
      const current = relationships.get(key) ?? { id: stableId("relation", key), source, target, type, descriptions: [], chapterIds: [], evidenceSegmentIds: [], confidence: 0 };
      current.descriptions = unique([...current.descriptions, item.description.trim()].filter(Boolean));
      current.chapterIds = unique([...current.chapterIds, analysis.chapterId]);
      current.evidenceSegmentIds = unique([...current.evidenceSegmentIds, ...evidenceFor(`${source} ${target} ${type}`, analysis), ...evidenceSegmentIds]);
      current.confidence = Math.max(current.confidence, analysis.confidence);
      relationships.set(key, current);
    }
    for (const [index, event] of (analysis.timelineEvents ?? []).entries()) {
      if (!event.title.trim() && !event.description.trim()) continue;
      timeline.push({ id: stableId("event", `${analysis.chapterId}:${index}:${event.title}`), chapterId: analysis.chapterId, chapterOrdinal: chapter.ordinal, chapterTitle: chapter.title, title: event.title.trim(), description: event.description.trim(), timeMarker: event.timeMarker.trim(), evidenceSegmentIds: unique([...evidenceFor(`${event.title} ${event.description}`, analysis), ...evidenceSegmentIds]), confidence: analysis.confidence });
    }
    for (const rule of analysis.worldRules ?? []) {
      const name = rule.name.trim();
      if (!name) continue;
      const key = normalize(name);
      const current = worldRules.get(key) ?? { id: stableId("rule", key), name, descriptions: [], chapterIds: [], evidenceSegmentIds: [], confidence: 0 };
      current.descriptions = unique([...current.descriptions, rule.description.trim()].filter(Boolean));
      current.chapterIds = unique([...current.chapterIds, analysis.chapterId]);
      current.evidenceSegmentIds = unique([...current.evidenceSegmentIds, ...evidenceFor(`${name} ${rule.description}`, analysis), ...evidenceSegmentIds]);
      current.confidence = Math.max(current.confidence, analysis.confidence);
      worldRules.set(key, current);
    }
    for (const [index, item] of (analysis.foreshadowing ?? []).entries()) {
      if (!item.setup.trim()) continue;
      foreshadowing.push({ id: stableId("setup", `${analysis.chapterId}:${index}:${item.setup}`), setup: item.setup.trim(), possiblePayoff: item.possiblePayoff.trim(), chapterId: analysis.chapterId, evidenceSegmentIds: unique([...evidenceFor(item.setup, analysis), ...evidenceSegmentIds]), confidence: analysis.confidence });
    }
    uncertainties.push(...analysis.uncertainties.filter(Boolean).map((text) => ({ chapterId: analysis.chapterId, text })));
  }

  return { version: 1, generatedAt, chapterCount: ordered.length, entities: [...entities.values()].sort(byName), relationships: [...relationships.values()].sort((a, b) => a.source.localeCompare(b.source, "zh-CN") || a.target.localeCompare(b.target, "zh-CN")), timeline, worldRules: [...worldRules.values()].sort(byName), foreshadowing, uncertainties };
}

function evidenceFor(needle: string, analysis: AnalysisInput): string[] {
  const terms = needle.toLocaleLowerCase("zh-CN").split(/\s+/).filter(Boolean);
  return unique(analysis.evidence.filter((item) => terms.some((term) => item.claim.toLocaleLowerCase("zh-CN").includes(term))).flatMap((item) => item.segmentIds));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

function stableId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function byName<T extends { name: string }>(left: T, right: T): number {
  return left.name.localeCompare(right.name, "zh-CN");
}
