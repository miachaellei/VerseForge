import { stableId } from "./hash.ts";

export type ContextLayer = "project" | "volume" | "chapter" | "scene" | "recent";

export interface TemporalFact {
  id: string;
  projectId: string;
  kind: "character" | "timeline" | "world" | "relationship" | "item" | "foreshadowing";
  text: string;
  validFromChapter: number;
  validThroughChapter?: number;
  revealedAtChapter: number;
  priority?: number;
}

export interface LayerSummary {
  id: string;
  projectId: string;
  layer: ContextLayer;
  text: string;
  validFromChapter: number;
  validThroughChapter: number;
  priority?: number;
}

export interface RetrievedPassage {
  id: string;
  projectId: string;
  chapterOrdinal: number;
  text: string;
  score: number;
}

export interface ContextSource {
  id: string;
  type: "fact" | "summary" | "passage";
  text: string;
  estimatedTokens: number;
}

export interface ContextSnapshot {
  id: string;
  projectId: string;
  targetChapter: number;
  maxInputTokens: number;
  estimatedTokens: number;
  sources: ContextSource[];
  prompt: string;
}

export interface AssembleContextInput {
  projectId: string;
  targetChapter: number;
  maxInputTokens: number;
  facts: TemporalFact[];
  summaries: LayerSummary[];
  passages: RetrievedPassage[];
}

const LAYER_PRIORITY: Record<ContextLayer, number> = {
  project: 500,
  volume: 400,
  chapter: 300,
  scene: 200,
  recent: 100,
};

export async function assembleContext(input: AssembleContextInput): Promise<ContextSnapshot> {
  if (!input.projectId.trim()) throw new Error("上下文必须指定项目");
  if (!Number.isInteger(input.targetChapter) || input.targetChapter < 0) throw new Error("目标章节序号无效");
  if (!Number.isFinite(input.maxInputTokens) || input.maxInputTokens <= 0) throw new Error("Token 预算必须大于零");

  const candidates: Array<ContextSource & { priority: number }> = [];
  for (const fact of input.facts) {
    if (fact.projectId !== input.projectId) continue;
    if (fact.validFromChapter > input.targetChapter || fact.revealedAtChapter > input.targetChapter) continue;
    if (fact.validThroughChapter !== undefined && fact.validThroughChapter < input.targetChapter) continue;
    candidates.push({ id: fact.id, type: "fact", text: fact.text, estimatedTokens: estimateTokens(fact.text), priority: 1_000 + (fact.priority ?? 0) });
  }
  for (const summary of input.summaries) {
    if (summary.projectId !== input.projectId) continue;
    if (summary.validFromChapter > input.targetChapter || summary.validThroughChapter < input.targetChapter) continue;
    candidates.push({ id: summary.id, type: "summary", text: summary.text, estimatedTokens: estimateTokens(summary.text), priority: LAYER_PRIORITY[summary.layer] + (summary.priority ?? 0) });
  }
  for (const passage of input.passages) {
    if (passage.projectId !== input.projectId || passage.chapterOrdinal > input.targetChapter) continue;
    candidates.push({ id: passage.id, type: "passage", text: passage.text, estimatedTokens: estimateTokens(passage.text), priority: Math.round(passage.score * 100) });
  }

  candidates.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  const sources: ContextSource[] = [];
  let estimatedTokens = 0;
  for (const candidate of candidates) {
    if (candidate.estimatedTokens > input.maxInputTokens - estimatedTokens) continue;
    const source: ContextSource = { id: candidate.id, type: candidate.type, text: candidate.text, estimatedTokens: candidate.estimatedTokens };
    sources.push(source);
    estimatedTokens += source.estimatedTokens;
  }
  const prompt = sources.map((source) => `[${source.type}:${source.id}]\n${source.text}`).join("\n\n");
  const fingerprint = `${input.projectId}:${input.targetChapter}:${input.maxInputTokens}:${sources.map((source) => source.id).join(",")}`;
  return {
    id: await stableId("ctx", fingerprint),
    projectId: input.projectId,
    targetChapter: input.targetChapter,
    maxInputTokens: input.maxInputTokens,
    estimatedTokens,
    sources,
    prompt,
  };
}

export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const nonCjk = text.length - cjk;
  return Math.max(1, Math.ceil(cjk / 1.5 + nonCjk / 4));
}
