import { invoke } from "@tauri-apps/api/core";
import type { ImportedSource } from "../core/types.ts";

export interface DesktopHealth {
  ok: boolean;
  appVersion: string;
  storage: string;
}

export interface DesktopImportProgress {
  active: boolean;
  percent: number;
  phase: string;
}

export interface SecureStoreHealth {
  available: boolean;
  backend: string;
}

export interface DesktopProjectRecord {
  id: string;
  title: string;
  genre: string;
  language: string;
  targetWordCount?: number;
  status: "preparing" | "rewriting" | "completed" | "archived";
  createdAt: number;
  updatedAt: number;
  trashedAt?: number;
}

export interface CreateDesktopProjectInput {
  title: string;
  genre: string;
  language: string;
  targetWordCount?: number;
}

export interface DesktopCandidateRecord<T = unknown> {
  id: string;
  projectId: string;
  kind: string;
  value: T;
  sourceSnapshotId?: string;
  status: "draft" | "accepted" | "rejected";
  createdAt: number;
  updatedAt: number;
}

export interface DesktopStoryBibleRecord<T = unknown> {
  id: string;
  projectId: string;
  kind: string;
  value: T;
  revision: number;
  updatedAt: number;
}

export interface DesktopSearchHit {
  segmentId: string;
  sourceDocumentId: string;
  chapterId: string;
  content: string;
  rank: number;
}

export interface DesktopSourceAnalysisRecord<T = unknown> {
  id: string;
  projectId: string;
  sourceDocumentId: string;
  chapterId: string;
  value: T;
  status: "draft" | "accepted" | "rejected";
  createdAt: number;
  updatedAt: number;
}

export interface DesktopAiTaskRecord {
  id: string;
  projectId: string;
  kind: string;
  providerId: string;
  model: string;
  status: "queued" | "running" | "paused" | "cancelling" | "cancelled" | "succeeded" | "failed";
  idempotencyKey: string;
  inputHash: string;
  input: unknown;
  output?: unknown;
  error?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface DesktopChapterDraft {
  id: string;
  projectId: string;
  chapterPlanId: string;
  title: string;
  content: string;
  status: "draft" | "final";
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface DesktopChapterVersion {
  id: string;
  chapterDocumentId: string;
  revision: number;
  title: string;
  content: string;
  source: "manual" | "ai" | "restore" | "finalize";
  createdAt: number;
}

export interface DesktopContextSnapshot<T = unknown> {
  id: string;
  projectId: string;
  scopeKind: string;
  scopeId: string;
  visibleThroughOrdinal?: number;
  payload: T;
  createdAt: number;
}

export interface DesktopConsistencyReport<T = unknown> {
  id: string;
  projectId: string;
  chapterPlanId: string;
  chapterDocumentRevision?: number;
  report: T;
  createdAt: number;
}

export interface DesktopProjectCheckpoint {
  id: string;
  projectId: string;
  name: string;
  byteSize: number;
  createdAt: number;
}

export type DesktopInvoker = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type DesktopImportedSource = Omit<ImportedSource, "document"> & {
  document: Omit<ImportedSource["document"], "importedAt"> & { importedAt: number };
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export class DesktopBridge {
  readonly #invoke: DesktopInvoker;

  constructor(invoker: DesktopInvoker = invoke as DesktopInvoker) {
    this.#invoke = invoker;
  }

  health(): Promise<DesktopHealth> {
    return this.#invoke<DesktopHealth>("desktop_health");
  }

  secureStoreHealth(): Promise<SecureStoreHealth> {
    return this.#invoke<SecureStoreHealth>("secure_store_health");
  }

  saveApiKey(providerId: string, apiKey: string): Promise<void> {
    return this.#invoke<void>("save_api_key", { providerId, apiKey });
  }

  loadApiKey(providerId: string): Promise<string | null> {
    return this.#invoke<string | null>("load_api_key", { providerId });
  }

  deleteApiKey(providerId: string): Promise<void> {
    return this.#invoke<void>("delete_api_key", { providerId });
  }

  listProjects(): Promise<DesktopProjectRecord[]> {
    return this.#invoke<DesktopProjectRecord[]>("list_projects");
  }

  listTrashedProjects(): Promise<DesktopProjectRecord[]> {
    return this.#invoke<DesktopProjectRecord[]>("list_trashed_projects");
  }

  trashProject(projectId: string): Promise<DesktopProjectRecord> {
    return this.#invoke<DesktopProjectRecord>("trash_project", { projectId });
  }

  restoreTrashedProject(projectId: string): Promise<DesktopProjectRecord> {
    return this.#invoke<DesktopProjectRecord>("restore_trashed_project", { projectId });
  }

  createProject(input: CreateDesktopProjectInput): Promise<DesktopProjectRecord> {
    return this.#invoke<DesktopProjectRecord>("create_project", { input });
  }

  renameProject(projectId: string, title: string): Promise<DesktopProjectRecord> {
    return this.#invoke<DesktopProjectRecord>("rename_project", { input: { projectId, title } });
  }

  setProjectStatus(projectId: string, status: DesktopProjectRecord["status"]): Promise<DesktopProjectRecord> {
    return this.#invoke<DesktopProjectRecord>("set_project_status", { projectId, status });
  }

  duplicateProject(projectId: string, title?: string): Promise<DesktopProjectRecord> {
    return this.#invoke<DesktopProjectRecord>("duplicate_project", { projectId, ...(title ? { title } : {}) });
  }

  parseDocument(path: string, projectId: string): Promise<unknown> {
    return this.#invoke("parse_document", { path, projectId });
  }

  async importDocument(path: string, projectId: string, rightsConfirmed: boolean): Promise<ImportedSource> {
    const source = await this.#invoke<DesktopImportedSource>("import_document", { path, projectId, rightsConfirmed });
    return normalizeImportedSource(source);
  }

  cancelImport(): Promise<void> {
    return this.#invoke<void>("cancel_import");
  }

  importProgress(): Promise<DesktopImportProgress> {
    return this.#invoke<DesktopImportProgress>("import_progress");
  }

  async listImportedSources(projectId: string): Promise<ImportedSource[]> {
    const sources = await this.#invoke<DesktopImportedSource[]>("list_imported_sources", { projectId });
    return sources.map(normalizeImportedSource);
  }

  async restoreSourceSnapshot(projectId: string, sourceSnapshot: unknown): Promise<ImportedSource> {
    const source = await this.#invoke<DesktopImportedSource>("restore_source_snapshot", { projectId, sourceSnapshot });
    return normalizeImportedSource(source);
  }

  async reviseSourceSnapshot(sourceSnapshot: ImportedSource, reason: string): Promise<ImportedSource> {
    const source = await this.#invoke<DesktopImportedSource>("revise_source_snapshot", { sourceSnapshot, reason });
    return normalizeImportedSource(source);
  }

  async selectImportDocument(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "小说文档", extensions: ["txt", "md", "markdown", "epub", "pdf"] }],
    });
    return typeof selected === "string" ? selected : null;
  }

  async selectExportPath(defaultPath: string, name: string, extensions: string[]): Promise<string | null> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const selected = await save({ defaultPath, filters: [{ name, extensions }] });
    return typeof selected === "string" ? selected : null;
  }

  async selectProjectPackage(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ multiple: false, directory: false, filters: [{ name: "声篇项目包", extensions: ["shengpian"] }] });
    return typeof selected === "string" ? selected : null;
  }

  writeExportFile(path: string, bytes: Uint8Array): Promise<void> {
    return this.#invoke<void>("write_export_file", { path, bytes: Array.from(bytes) });
  }

  async readProjectPackage(path: string): Promise<Uint8Array> {
    const bytes = await this.#invoke<number[]>("read_project_package", { path });
    return Uint8Array.from(bytes);
  }

  createProjectCheckpoint(projectId: string, name: string, bytes: Uint8Array): Promise<DesktopProjectCheckpoint> {
    return this.#invoke<DesktopProjectCheckpoint>("create_project_checkpoint", { projectId, name, bytes: Array.from(bytes) });
  }

  listProjectCheckpoints(projectId: string): Promise<DesktopProjectCheckpoint[]> {
    return this.#invoke<DesktopProjectCheckpoint[]>("list_project_checkpoints", { projectId });
  }

  async readProjectCheckpoint(checkpointId: string): Promise<Uint8Array> {
    const bytes = await this.#invoke<number[]>("read_project_checkpoint", { checkpointId });
    return Uint8Array.from(bytes);
  }

  createCandidate<T>(input: { projectId: string; kind: string; value: T; sourceSnapshotId?: string }): Promise<DesktopCandidateRecord<T>> {
    return this.#invoke<DesktopCandidateRecord<T>>("create_ai_candidate", { input });
  }

  listCandidates<T = unknown>(projectId: string, kind?: string): Promise<DesktopCandidateRecord<T>[]> {
    return this.#invoke<DesktopCandidateRecord<T>[]>("list_ai_candidates", { projectId, kind });
  }

  acceptCandidate<T>(candidateId: string): Promise<DesktopStoryBibleRecord<T>> {
    return this.#invoke<DesktopStoryBibleRecord<T>>("accept_ai_candidate", { candidateId });
  }

  rejectCandidate(candidateId: string): Promise<void> {
    return this.#invoke<void>("reject_ai_candidate", { candidateId });
  }

  listStoryBible<T = unknown>(projectId: string): Promise<DesktopStoryBibleRecord<T>[]> {
    return this.#invoke<DesktopStoryBibleRecord<T>[]>("list_story_bible", { projectId });
  }

  saveStoryBible<T>(input: { projectId: string; kind: string; value: T }): Promise<DesktopStoryBibleRecord<T>> {
    return this.#invoke<DesktopStoryBibleRecord<T>>("save_story_bible", { input });
  }

  searchSourceSegments(projectId: string, query: string, limit = 20): Promise<DesktopSearchHit[]> {
    return this.#invoke<DesktopSearchHit[]>("search_source_segments", { projectId, query, limit });
  }

  saveSourceAnalysis<T>(input: { projectId: string; sourceDocumentId: string; chapterId: string; value: T }): Promise<DesktopSourceAnalysisRecord<T>> {
    return this.#invoke<DesktopSourceAnalysisRecord<T>>("save_source_analysis", { input });
  }

  listSourceAnalysis<T = unknown>(sourceDocumentId: string): Promise<DesktopSourceAnalysisRecord<T>[]> {
    return this.#invoke<DesktopSourceAnalysisRecord<T>[]>("list_source_analysis", { sourceDocumentId });
  }

  setSourceAnalysisStatus<T = unknown>(analysisId: string, status: DesktopSourceAnalysisRecord["status"]): Promise<DesktopSourceAnalysisRecord<T>> {
    return this.#invoke<DesktopSourceAnalysisRecord<T>>("set_source_analysis_status", { analysisId, status });
  }

  createAiTask(input: { id: string; projectId: string; kind: string; providerId: string; model: string; idempotencyKey: string; inputHash: string; input: unknown }): Promise<DesktopAiTaskRecord> {
    return this.#invoke<DesktopAiTaskRecord>("create_ai_task", { input });
  }

  updateAiTask(input: { taskId: string; expectedRevision: number; status: DesktopAiTaskRecord["status"]; output?: unknown; error?: unknown; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number }): Promise<DesktopAiTaskRecord> {
    return this.#invoke<DesktopAiTaskRecord>("update_ai_task", { input });
  }

  listAiTasks(projectId: string): Promise<DesktopAiTaskRecord[]> {
    return this.#invoke<DesktopAiTaskRecord[]>("list_ai_tasks", { projectId });
  }

  saveChapterDraft(input: { projectId: string; chapterPlanId: string; title: string; content: string; source: DesktopChapterVersion["source"]; expectedRevision?: number }): Promise<DesktopChapterDraft> {
    return this.#invoke<DesktopChapterDraft>("save_chapter_draft", { input });
  }

  listChapterDrafts(projectId: string): Promise<DesktopChapterDraft[]> {
    return this.#invoke<DesktopChapterDraft[]>("list_chapter_drafts", { projectId });
  }

  listChapterVersions(chapterDocumentId: string): Promise<DesktopChapterVersion[]> {
    return this.#invoke<DesktopChapterVersion[]>("list_chapter_versions", { chapterDocumentId });
  }

  setChapterStatus(chapterDocumentId: string, status: DesktopChapterDraft["status"]): Promise<DesktopChapterDraft> {
    return this.#invoke<DesktopChapterDraft>("set_chapter_status", { chapterDocumentId, status });
  }

  createContextSnapshot<T>(input: { id: string; projectId: string; scopeKind: string; scopeId: string; visibleThroughOrdinal?: number; payload: T }): Promise<DesktopContextSnapshot<T>> {
    return this.#invoke<DesktopContextSnapshot<T>>("create_context_snapshot", { input });
  }

  listContextSnapshots<T = unknown>(projectId: string, scopeId?: string): Promise<DesktopContextSnapshot<T>[]> {
    return this.#invoke<DesktopContextSnapshot<T>[]>("list_context_snapshots", { projectId, ...(scopeId ? { scopeId } : {}) });
  }

  saveConsistencyReport<T>(input: { projectId: string; chapterPlanId: string; chapterDocumentRevision?: number; report: T }): Promise<DesktopConsistencyReport<T>> {
    return this.#invoke<DesktopConsistencyReport<T>>("save_consistency_report", { input });
  }

  listConsistencyReports<T = unknown>(projectId: string, chapterPlanId: string): Promise<DesktopConsistencyReport<T>[]> {
    return this.#invoke<DesktopConsistencyReport<T>[]>("list_consistency_reports", { projectId, chapterPlanId });
  }
}

function normalizeImportedSource(source: DesktopImportedSource): ImportedSource {
  return {
    ...source,
    document: {
      ...source.document,
      importedAt: new Date(source.document.importedAt * 1000).toISOString(),
    },
  };
}
