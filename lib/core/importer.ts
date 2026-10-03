import { sha256Hex, stableId } from "./hash.ts";
import type {
  ImportedSource,
  ImportQualityIssue,
  SourceChapter,
  SourceDocument,
  SourceSegment,
} from "./types.ts";

export const TEXT_IMPORTER_VERSION = "txt-1";

export interface TextImportInput {
  projectId: string;
  fileName: string;
  bytes: Uint8Array;
  importedAt?: string;
}

interface DecodedText {
  text: string;
  encoding: string;
}

const CHAPTER_HEADING = /^\s*(?:(第[〇零一二三四五六七八九十百千万两\d]+[卷部篇章节回])|(?:卷|章)[〇零一二三四五六七八九十百千万两\d]+|(?:序章|楔子|引子|前言|后记|尾声|终章|番外(?:篇)?(?:[一二三四五六七八九十\d]+)?))(?:[\s　:：、.-]+.*)?\s*$/;

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8-bom" };
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  }

  const utf8 = decodeUtf8(bytes);
  if (utf8 !== null) return { text: utf8, encoding: "utf-8" };

  return { text: new TextDecoder("gb18030").decode(bytes), encoding: "gb18030" };
}

function findChapterBoundaries(text: string): { title: string; start: number; contentStart: number }[] {
  const boundaries: { title: string; start: number; contentStart: number }[] = [];
  const lines = text.matchAll(/.*(?:\n|$)/g);

  for (const match of lines) {
    const fullLine = match[0];
    if (!fullLine) continue;
    const title = fullLine.replace(/[\r\n]+$/, "").trim();
    if (!title || !CHAPTER_HEADING.test(title)) continue;
    boundaries.push({ title, start: match.index, contentStart: match.index + fullLine.length });
  }

  return boundaries;
}

async function createSegments(documentId: string, chapter: SourceChapter): Promise<SourceSegment[]> {
  const segments: SourceSegment[] = [];
  const paragraphPattern = /\S(?:.*\S)?/g;
  let ordinal = 0;

  for (const match of chapter.content.matchAll(paragraphPattern)) {
    const content = match[0].trim();
    if (!content) continue;
    const startOffset = chapter.startOffset + match.index;
    segments.push({
      id: await stableId("seg", `${documentId}:${chapter.ordinal}:${ordinal}:${startOffset}:${content}`),
      sourceDocumentId: documentId,
      chapterId: chapter.id,
      ordinal,
      content,
      startOffset,
      endOffset: startOffset + match[0].length,
    });
    ordinal += 1;
  }

  return segments;
}

function qualityIssues(text: string, chapters: SourceChapter[], hadHeadings: boolean): ImportQualityIssue[] {
  const issues: ImportQualityIssue[] = [];
  if (!text.trim()) issues.push({ code: "EMPTY_DOCUMENT", severity: "error", message: "文档没有可导入的正文。" });
  if (!hadHeadings && text.trim()) issues.push({ code: "NO_CHAPTER_HEADINGS", severity: "warning", message: "未识别到章节标题，已将全文作为一个章节导入。" });
  if (text.includes("�")) issues.push({ code: "REPLACEMENT_CHARACTER", severity: "warning", message: "文本包含乱码替代字符，请检查文件编码。" });

  for (const chapter of chapters) {
    const length = chapter.content.replace(/\s/g, "").length;
    if (length === 0) issues.push({ code: "EMPTY_CHAPTER", severity: "warning", message: `“${chapter.title}”没有正文。`, chapterId: chapter.id });
    else if (length < 100) issues.push({ code: "VERY_SHORT_CHAPTER", severity: "info", message: `“${chapter.title}”正文少于 100 字。`, chapterId: chapter.id });
  }
  return issues;
}

export async function importTextDocument(input: TextImportInput): Promise<ImportedSource> {
  const decoded = decodeText(input.bytes);
  const originalText = decoded.text;
  const sha256 = await sha256Hex(input.bytes);
  const documentId = await stableId("src", `${input.projectId}:${sha256}`);
  const importedAt = input.importedAt ?? new Date().toISOString();
  const document: SourceDocument = {
    id: documentId,
    projectId: input.projectId,
    fileName: input.fileName,
    format: input.fileName.toLowerCase().endsWith(".md") ? "markdown" : "txt",
    byteSize: input.bytes.byteLength,
    sha256,
    encoding: decoded.encoding,
    parserVersion: TEXT_IMPORTER_VERSION,
    importedAt,
    originalText,
  };

  const boundaries = findChapterBoundaries(originalText);
  const chapters: SourceChapter[] = [];

  if (boundaries.length === 0) {
    const id = await stableId("chapter", `${documentId}:0:0:${originalText.length}`);
    chapters.push({ id, sourceDocumentId: documentId, ordinal: 0, title: "正文", content: originalText, startOffset: 0, endOffset: originalText.length });
  } else {
    const prefix = originalText.slice(0, boundaries[0].start);
    if (prefix.trim()) {
      const id = await stableId("chapter", `${documentId}:0:0:${boundaries[0].start}`);
      chapters.push({ id, sourceDocumentId: documentId, ordinal: 0, title: "章节前内容", content: prefix, startOffset: 0, endOffset: boundaries[0].start });
    }

    for (let index = 0; index < boundaries.length; index += 1) {
      const boundary = boundaries[index];
      const endOffset = boundaries[index + 1]?.start ?? originalText.length;
      const ordinal = chapters.length;
      const id = await stableId("chapter", `${documentId}:${ordinal}:${boundary.start}:${endOffset}`);
      chapters.push({
        id,
        sourceDocumentId: documentId,
        ordinal,
        title: boundary.title,
        content: originalText.slice(boundary.contentStart, endOffset).replace(/^\s+|\s+$/g, ""),
        startOffset: boundary.contentStart,
        endOffset,
      });
    }
  }

  const segments = (await Promise.all(chapters.map((chapter) => createSegments(documentId, chapter)))).flat();
  return { document, chapters, segments, issues: qualityIssues(originalText, chapters, boundaries.length > 0) };
}

