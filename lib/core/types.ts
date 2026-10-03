export type EntityId = string;

export type ProjectStatus = "preparing" | "rewriting" | "completed" | "archived";

export interface ProjectRecord {
  id: EntityId;
  title: string;
  genre: string;
  language: string;
  targetWordCount?: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export type ImportFormat = "txt" | "epub" | "pdf" | "markdown" | "docx";

export interface SourceDocument {
  id: EntityId;
  projectId: EntityId;
  fileName: string;
  format: ImportFormat;
  byteSize: number;
  sha256: string;
  encoding?: string;
  parserVersion: string;
  importedAt: string;
  /** Decoded source text is immutable after import. */
  originalText: string;
}

export interface SourceChapter {
  id: EntityId;
  sourceDocumentId: EntityId;
  ordinal: number;
  title: string;
  content: string;
  startOffset: number;
  endOffset: number;
}

export interface SourceSegment {
  id: EntityId;
  sourceDocumentId: EntityId;
  chapterId: EntityId;
  ordinal: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

export type ImportIssueCode =
  | "EMPTY_DOCUMENT"
  | "NO_CHAPTER_HEADINGS"
  | "EMPTY_CHAPTER"
  | "VERY_SHORT_CHAPTER"
  | "REPLACEMENT_CHARACTER"
  | "DUPLICATE_CHAPTER_TITLE"
  | "CLEANING_REMOVED_CONTENT";

export interface ImportQualityIssue {
  code: ImportIssueCode;
  severity: "info" | "warning" | "error";
  message: string;
  chapterId?: EntityId;
}

export interface ImportedSource {
  document: SourceDocument;
  chapters: SourceChapter[];
  segments: SourceSegment[];
  issues: ImportQualityIssue[];
}

export type CandidateStatus = "draft" | "accepted" | "rejected";

export interface AiCandidate<T> {
  id: EntityId;
  projectId: EntityId;
  kind: string;
  status: CandidateStatus;
  value: T;
  sourceSnapshotId: EntityId;
  createdAt: string;
}
