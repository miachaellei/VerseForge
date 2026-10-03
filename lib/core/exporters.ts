import type { StoryPlan } from "./story-plan.ts";
import { createStoredZip, readStoredZip } from "./zip.ts";

export interface ExportChapter {
  number: number;
  title: string;
  content: string;
}

export interface ImportedProjectPackage {
  manifest: { format: "shengpian-project"; version: 1; exportedAt: string; appVersion: string; project: unknown; sourceManifest: unknown };
  database: Record<string, unknown>;
  storyBible: Record<string, unknown>;
  storyPlan: StoryPlan;
  sources: unknown[];
  chapters: ExportChapter[];
}

export function exportPlainText(title: string, chapters: ExportChapter[]): string {
  return [title.trim(), ...chapters.flatMap((chapter) => [`第${chapter.number}章 ${chapter.title}`, chapter.content.trim()])].filter(Boolean).join("\n\n");
}

export function exportMarkdown(title: string, chapters: ExportChapter[]): string {
  return [`# ${title.trim()}`, ...chapters.flatMap((chapter) => [`## 第${chapter.number}章 ${chapter.title}`, chapter.content.trim()])].join("\n\n") + "\n";
}

export function exportDocx(title: string, chapters: ExportChapter[]): Uint8Array {
  const paragraphs = [
    paragraph(title, "Title"),
    ...chapters.flatMap((chapter) => [paragraph(`第${chapter.number}章 ${chapter.title}`, "Heading1"), ...chapter.content.split(/\n+/).filter(Boolean).map((text) => paragraph(text))]),
  ].join("");
  return createStoredZip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>` },
    { name: "word/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>` },
    { name: "word/document.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>` },
  ]);
}

export function exportProjectPackage(input: { appVersion: string; project: unknown; storyBible: unknown; storyPlan: StoryPlan; chapters: ExportChapter[]; sourceManifest: unknown; database?: unknown; sources?: unknown }): Uint8Array {
  const manifest = { format: "shengpian-project", version: 1, exportedAt: new Date().toISOString(), appVersion: input.appVersion, project: input.project, sourceManifest: input.sourceManifest, includes: ["database.json", "rewrite-canon.json", "story-plan.json", "chapters/", "sources.json"] };
  return createStoredZip([
    { name: "manifest.json", data: JSON.stringify(manifest, null, 2) },
    { name: "database.json", data: JSON.stringify(input.database ?? {}, null, 2) },
    { name: "rewrite-canon.json", data: JSON.stringify(input.storyBible, null, 2) },
    { name: "story-plan.json", data: JSON.stringify(input.storyPlan, null, 2) },
    { name: "sources.json", data: JSON.stringify(input.sources ?? [], null, 2) },
    ...input.chapters.map((chapter) => ({ name: `chapters/${String(chapter.number).padStart(4, "0")}.json`, data: JSON.stringify(chapter, null, 2) })),
  ]);
}

export function importProjectPackage(bytes: Uint8Array): ImportedProjectPackage {
  const files = readStoredZip(bytes);
  const manifest = readJson(files, "manifest.json") as ImportedProjectPackage["manifest"];
  if (!manifest || typeof manifest !== "object" || manifest.format !== "shengpian-project" || manifest.version !== 1) throw new Error("不是受支持的声篇项目包");
  if (typeof manifest.exportedAt !== "string" || typeof manifest.appVersion !== "string") throw new Error("项目包清单缺少版本信息");
  const database = requireRecord(readJson(files, "database.json"), "项目数据库");
  const storyBible = requireRecord(readJson(files, "rewrite-canon.json"), "故事圣经");
  const storyPlan = requireRecord(readJson(files, "story-plan.json"), "故事规划") as unknown as StoryPlan;
  if (storyPlan.version !== 1 || !Array.isArray(storyPlan.volumes)) throw new Error("项目包故事规划版本无效");
  const sources = readJson(files, "sources.json");
  if (!Array.isArray(sources)) throw new Error("项目包原文快照无效");
  const chapters = [...files.entries()]
    .filter(([name]) => /^chapters\/\d{4,}\.json$/.test(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name]) => {
      const value = requireRecord(parseJson(name, files.get(name)!), `章节 ${name}`);
      if (!Number.isInteger(value.number) || typeof value.title !== "string" || typeof value.content !== "string") throw new Error(`项目包章节无效：${name}`);
      return value as unknown as ExportChapter;
    });
  return { manifest, database, storyBible, storyPlan, sources, chapters };
}

function readJson(files: Map<string, Uint8Array>, name: string): unknown {
  const bytes = files.get(name);
  if (!bytes) throw new Error(`项目包缺少 ${name}`);
  return parseJson(name, bytes);
}

function parseJson(name: string, bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`项目包中的 ${name} 不是有效 JSON`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}格式无效`);
  return value as Record<string, unknown>;
}

function paragraph(text: string, style?: string): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
