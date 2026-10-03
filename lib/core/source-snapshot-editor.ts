import { stableId } from "./hash.ts";
import type { ImportedSource, ImportQualityIssue, SourceChapter, SourceSegment } from "./types.ts";

export interface SourceCleaningOptions {
  removePageNumbers: boolean;
  removeRepeatedHeadersFooters: boolean;
  deduplicateConsecutiveParagraphs: boolean;
  joinPdfHardWraps: boolean;
  blockedLineFragments: string[];
}

export interface CleaningPreview {
  source: ImportedSource;
  changedChapters: number;
  removedLines: number;
  joinedLines: number;
  removedCharacters: number;
}

export const defaultCleaningOptions: SourceCleaningOptions = {
  removePageNumbers: true,
  removeRepeatedHeadersFooters: true,
  deduplicateConsecutiveParagraphs: true,
  joinPdfHardWraps: true,
  blockedLineFragments: [],
};

type EditableChapter = Pick<SourceChapter, "title" | "content">;

function qualityIssues(chapters: SourceChapter[], removedCharacters = 0): ImportQualityIssue[] {
  const issues: ImportQualityIssue[] = [];
  const titleCounts = new Map<string, number>();
  for (const chapter of chapters) titleCounts.set(chapter.title.trim(), (titleCounts.get(chapter.title.trim()) ?? 0) + 1);
  for (const chapter of chapters) {
    const length = chapter.content.replace(/\s/g, "").length;
    if (!length) issues.push({ code: "EMPTY_CHAPTER", severity: "warning", message: `“${chapter.title}”没有正文。`, chapterId: chapter.id });
    else if (length < 100) issues.push({ code: "VERY_SHORT_CHAPTER", severity: "info", message: `“${chapter.title}”正文少于 100 字。`, chapterId: chapter.id });
    if ((titleCounts.get(chapter.title.trim()) ?? 0) > 1) issues.push({ code: "DUPLICATE_CHAPTER_TITLE", severity: "warning", message: `章节标题“${chapter.title}”重复。`, chapterId: chapter.id });
    if (chapter.content.includes("�")) issues.push({ code: "REPLACEMENT_CHARACTER", severity: "warning", message: `“${chapter.title}”包含乱码替代字符。`, chapterId: chapter.id });
  }
  if (removedCharacters > 0) issues.push({ code: "CLEANING_REMOVED_CONTENT", severity: "info", message: `清洗预览移除了 ${removedCharacters} 个字符；保存前请核对正文。` });
  return issues;
}

async function rebuild(source: ImportedSource, editable: EditableChapter[], removedCharacters = 0): Promise<ImportedSource> {
  if (!editable.length) throw new Error("解析快照至少需要一个章节");
  const chapters: SourceChapter[] = [];
  const segments: SourceSegment[] = [];
  let cursor = 0;
  for (let ordinal = 0; ordinal < editable.length; ordinal += 1) {
    const title = editable[ordinal].title.trim() || `未命名章节 ${ordinal + 1}`;
    const content = editable[ordinal].content.replace(/\r\n?/g, "\n").trim();
    const chapterId = await stableId("chapter", `${source.document.id}:edited:${ordinal}:${title}:${content}`);
    const chapter: SourceChapter = { id: chapterId, sourceDocumentId: source.document.id, ordinal, title, content, startOffset: cursor, endOffset: cursor + content.length };
    chapters.push(chapter);
    let segmentOrdinal = 0;
    for (const match of content.matchAll(/\S(?:.*\S)?/g)) {
      const text = match[0].trim();
      if (!text) continue;
      const startOffset = cursor + match.index;
      segments.push({ id: await stableId("seg", `${source.document.id}:${chapterId}:${segmentOrdinal}:${text}`), sourceDocumentId: source.document.id, chapterId, ordinal: segmentOrdinal, content: text, startOffset, endOffset: startOffset + match[0].length });
      segmentOrdinal += 1;
    }
    cursor += content.length + 2;
  }
  return { document: { ...source.document, parserVersion: "manual-edit/preview" }, chapters, segments, issues: qualityIssues(chapters, removedCharacters) };
}

function repeatedBoundaryLines(chapters: EditableChapter[]): Set<string> {
  const counts = new Map<string, number>();
  for (const chapter of chapters) {
    const lines = chapter.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const candidates = new Set([...lines.slice(0, 2), ...lines.slice(-2)]);
    for (const line of candidates) if (line.length >= 2 && line.length <= 80) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(chapters.length * 0.6));
  return new Set([...counts].filter(([, count]) => count >= threshold).map(([line]) => line));
}

export async function previewSourceCleaning(source: ImportedSource, options: SourceCleaningOptions): Promise<CleaningPreview> {
  const repeated = options.removeRepeatedHeadersFooters ? repeatedBoundaryLines(source.chapters) : new Set<string>();
  let removedLines = 0;
  let joinedLines = 0;
  let removedCharacters = 0;
  let changedChapters = 0;
  const editable = source.chapters.map((chapter) => {
    const before = chapter.content.replace(/\r\n?/g, "\n");
    const filtered: string[] = [];
    for (const rawLine of before.split("\n")) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      const pageNumber = /^\s*(?:第\s*)?\d+\s*页\s*$/.test(trimmed) || /^[-—–]?\s*\d+\s*[-—–]?$/.test(trimmed);
      const blocked = options.blockedLineFragments.some((fragment) => fragment.trim() && trimmed.includes(fragment.trim()));
      if ((options.removePageNumbers && pageNumber) || repeated.has(trimmed) || blocked) {
        removedLines += 1;
        removedCharacters += rawLine.length;
        continue;
      }
      if (options.deduplicateConsecutiveParagraphs && trimmed && filtered.at(-1)?.trim() === trimmed) {
        removedLines += 1;
        removedCharacters += rawLine.length;
        continue;
      }
      if (options.joinPdfHardWraps && trimmed && filtered.length && filtered.at(-1)?.trim() && !/[。！？!?；;：:“”」』）)]$/.test(filtered.at(-1)!.trim()) && !/^\s/.test(rawLine)) {
        filtered[filtered.length - 1] = `${filtered.at(-1)!.trimEnd()}${trimmed}`;
        joinedLines += 1;
      } else filtered.push(line);
    }
    const content = filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (content !== before.trim()) changedChapters += 1;
    return { title: chapter.title, content };
  });
  return { source: await rebuild(source, editable, removedCharacters), changedChapters, removedLines, joinedLines, removedCharacters };
}

export async function splitSourceChapter(source: ImportedSource, chapterId: string, characterOffset: number, nextTitle?: string): Promise<ImportedSource> {
  const index = source.chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) throw new Error("找不到要拆分的章节");
  const chapter = source.chapters[index];
  if (!Number.isInteger(characterOffset) || characterOffset <= 0 || characterOffset >= chapter.content.length) throw new Error("拆分位置必须位于章节正文内部");
  const editable = source.chapters.map(({ title, content }) => ({ title, content }));
  editable.splice(index, 1, { title: chapter.title, content: chapter.content.slice(0, characterOffset) }, { title: nextTitle?.trim() || `${chapter.title}（下）`, content: chapter.content.slice(characterOffset) });
  return rebuild(source, editable);
}

export async function mergeSourceChapterWithNext(source: ImportedSource, chapterId: string): Promise<ImportedSource> {
  const index = source.chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0 || index >= source.chapters.length - 1) throw new Error("当前章节后没有可合并章节");
  const editable = source.chapters.map(({ title, content }) => ({ title, content }));
  editable.splice(index, 2, { title: editable[index].title, content: `${editable[index].content.trim()}\n\n${editable[index + 1].content.trim()}` });
  return rebuild(source, editable);
}

export async function moveSourceChapter(source: ImportedSource, chapterId: string, direction: -1 | 1): Promise<ImportedSource> {
  const index = source.chapters.findIndex((chapter) => chapter.id === chapterId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= source.chapters.length) throw new Error("章节已经位于目标方向边界");
  const editable = source.chapters.map(({ title, content }) => ({ title, content }));
  [editable[index], editable[target]] = [editable[target], editable[index]];
  return rebuild(source, editable);
}

export async function renameSourceChapter(source: ImportedSource, chapterId: string, title: string): Promise<ImportedSource> {
  if (!title.trim()) throw new Error("章节标题不能为空");
  const editable = source.chapters.map((chapter) => ({ title: chapter.id === chapterId ? title.trim() : chapter.title, content: chapter.content }));
  return rebuild(source, editable);
}
