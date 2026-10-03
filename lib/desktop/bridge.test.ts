import assert from "node:assert/strict";
import test from "node:test";
import { DesktopBridge, type DesktopInvoker } from "./bridge.ts";

test("maps desktop commands to stable invoke arguments", async () => {
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const invoker: DesktopInvoker = async <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "desktop_health") return { ok: true, appVersion: "0.1.0", storage: "sqlite-wal" } as T;
    if (command === "secure_store_health") return { available: true, backend: "test-keychain" } as T;
    if (command === "load_api_key") return "restored-secret" as T;
    if (command === "list_projects" || command === "list_trashed_projects") return [] as T;
    if (command === "create_project") return { id: "project-1" } as T;
    if (command === "rename_project" || command === "set_project_status" || command === "duplicate_project" || command === "trash_project" || command === "restore_trashed_project") return { id: "project-1" } as T;
    if (command === "import_document" || command === "restore_source_snapshot" || command === "revise_source_snapshot") return { document: { id: "source-1", projectId: "project-1", fileName: "novel.txt", format: "txt", byteSize: 1, sha256: "hash", parserVersion: "worker-1", importedAt: 1_790_553_600, originalText: "正文" }, chapters: [], segments: [], issues: [] } as T;
    if (command === "list_imported_sources") return [] as T;
    if (command === "create_ai_candidate") return { id: "candidate-1", status: "draft" } as T;
    if (command === "accept_ai_candidate") return { id: "bible-1", revision: 1 } as T;
    if (command === "list_story_bible") return [] as T;
    if (command === "save_story_bible") return { id: "bible-1", revision: 2 } as T;
    if (command === "search_source_segments") return [] as T;
    if (command === "save_source_analysis" || command === "set_source_analysis_status") return { id: "analysis-1", status: "draft" } as T;
    if (command === "list_source_analysis") return [] as T;
    if (command === "create_ai_task" || command === "update_ai_task") return { id: "task-1", status: "running", revision: 1 } as T;
    if (command === "list_ai_tasks") return [] as T;
    if (command === "save_chapter_draft" || command === "set_chapter_status") return { id: "draft-1", revision: 1, status: "draft" } as T;
    if (command === "list_chapter_drafts" || command === "list_chapter_versions") return [] as T;
    if (command === "create_context_snapshot") return { id: "snapshot-1" } as T;
    if (command === "list_context_snapshots") return [] as T;
    if (command === "save_consistency_report") return { id: "report-1" } as T;
    if (command === "list_consistency_reports") return [] as T;
    if (command === "read_project_package") return [80, 75, 3, 4] as T;
    if (command === "create_project_checkpoint") return { id: "checkpoint-1", name: "初稿" } as T;
    if (command === "list_project_checkpoints") return [] as T;
    if (command === "read_project_checkpoint") return [80, 75] as T;
    return { ok: true } as T;
  };
  const bridge = new DesktopBridge(invoker);

  assert.equal((await bridge.health()).storage, "sqlite-wal");
  assert.equal((await bridge.secureStoreHealth()).backend, "test-keychain");
  await bridge.saveApiKey("openai-compatible", "secret");
  assert.equal(await bridge.loadApiKey("openai-compatible"), "restored-secret");
  await bridge.deleteApiKey("openai-compatible");
  await bridge.writeExportFile("/tmp/book.txt", new Uint8Array([1, 2, 3]));
  assert.deepEqual(await bridge.readProjectPackage("/tmp/book.shengpian"), new Uint8Array([80, 75, 3, 4]));
  await bridge.createProjectCheckpoint("project-1", "初稿", new Uint8Array([1, 2]));
  await bridge.listProjectCheckpoints("project-1");
  assert.deepEqual(await bridge.readProjectCheckpoint("checkpoint-1"), new Uint8Array([80, 75]));
  await bridge.listProjects();
  await bridge.listTrashedProjects();
  await bridge.createProject({ title: "雾港来信", genre: "悬疑", language: "zh-CN", targetWordCount: 300_000 });
  await bridge.trashProject("project-1");
  await bridge.restoreTrashedProject("project-1");
  await bridge.renameProject("project-1", "新书名");
  await bridge.setProjectStatus("project-1", "archived");
  await bridge.duplicateProject("project-1", "项目副本");
  await bridge.parseDocument("/tmp/novel.txt", "project-1");
  const imported = await bridge.importDocument("/tmp/novel.txt", "project-1", true);
  assert.equal(imported.document.importedAt, "2026-09-28T00:00:00.000Z");
  await bridge.restoreSourceSnapshot("project-1", { document: { id: "source-old" } });
  await bridge.reviseSourceSnapshot(imported, "手工拆章");
  await bridge.listImportedSources("project-1");
  const candidate = await bridge.createCandidate({ projectId: "project-1", kind: "synopsis", value: { summary: "候选" }, sourceSnapshotId: "source-1" });
  await bridge.acceptCandidate(candidate.id);
  await bridge.rejectCandidate("candidate-2");
  await bridge.listStoryBible("project-1");
  await bridge.saveStoryBible({ projectId: "project-1", kind: "synopsis", value: { summary: "手工修订" } });
  await bridge.searchSourceSegments("project-1", "雾港", 5);
  await bridge.saveSourceAnalysis({ projectId: "project-1", sourceDocumentId: "source-1", chapterId: "chapter-1", value: { summary: "摘要" } });
  await bridge.listSourceAnalysis("source-1");
  await bridge.setSourceAnalysisStatus("analysis-1", "accepted");
  await bridge.createAiTask({ id: "task-1", projectId: "project-1", kind: "source.analyze", providerId: "anthropic", model: "writer", idempotencyKey: "source-1:v1", inputHash: "hash-1", input: { sourceDocumentId: "source-1" } });
  await bridge.updateAiTask({ taskId: "task-1", expectedRevision: 0, status: "running" });
  await bridge.listAiTasks("project-1");
  await bridge.saveChapterDraft({ projectId: "project-1", chapterPlanId: "chapter-plan-1", title: "第一章", content: "正文", source: "manual", expectedRevision: 0 });
  await bridge.listChapterDrafts("project-1");
  await bridge.listChapterVersions("draft-1");
  await bridge.setChapterStatus("draft-1", "final");
  await bridge.createContextSnapshot({ id: "snapshot-1", projectId: "project-1", scopeKind: "chapter_generation", scopeId: "chapter-plan-1", visibleThroughOrdinal: 1, payload: { sources: [] } });
  await bridge.listContextSnapshots("project-1", "chapter-plan-1");
  await bridge.saveConsistencyReport({ projectId: "project-1", chapterPlanId: "chapter-plan-1", chapterDocumentRevision: 1, report: { issues: [] } });
  await bridge.listConsistencyReports("project-1", "chapter-plan-1");

  assert.deepEqual(calls, [
    { command: "desktop_health", args: undefined },
    { command: "secure_store_health", args: undefined },
    { command: "save_api_key", args: { providerId: "openai-compatible", apiKey: "secret" } },
    { command: "load_api_key", args: { providerId: "openai-compatible" } },
    { command: "delete_api_key", args: { providerId: "openai-compatible" } },
    { command: "write_export_file", args: { path: "/tmp/book.txt", bytes: [1, 2, 3] } },
    { command: "read_project_package", args: { path: "/tmp/book.shengpian" } },
    { command: "create_project_checkpoint", args: { projectId: "project-1", name: "初稿", bytes: [1, 2] } },
    { command: "list_project_checkpoints", args: { projectId: "project-1" } },
    { command: "read_project_checkpoint", args: { checkpointId: "checkpoint-1" } },
    { command: "list_projects", args: undefined },
    { command: "list_trashed_projects", args: undefined },
    { command: "create_project", args: { input: { title: "雾港来信", genre: "悬疑", language: "zh-CN", targetWordCount: 300_000 } } },
    { command: "trash_project", args: { projectId: "project-1" } },
    { command: "restore_trashed_project", args: { projectId: "project-1" } },
    { command: "rename_project", args: { input: { projectId: "project-1", title: "新书名" } } },
    { command: "set_project_status", args: { projectId: "project-1", status: "archived" } },
    { command: "duplicate_project", args: { projectId: "project-1", title: "项目副本" } },
    { command: "parse_document", args: { path: "/tmp/novel.txt", projectId: "project-1" } },
    { command: "import_document", args: { path: "/tmp/novel.txt", projectId: "project-1", rightsConfirmed: true } },
    { command: "restore_source_snapshot", args: { projectId: "project-1", sourceSnapshot: { document: { id: "source-old" } } } },
    { command: "revise_source_snapshot", args: { sourceSnapshot: imported, reason: "手工拆章" } },
    { command: "list_imported_sources", args: { projectId: "project-1" } },
    { command: "create_ai_candidate", args: { input: { projectId: "project-1", kind: "synopsis", value: { summary: "候选" }, sourceSnapshotId: "source-1" } } },
    { command: "accept_ai_candidate", args: { candidateId: "candidate-1" } },
    { command: "reject_ai_candidate", args: { candidateId: "candidate-2" } },
    { command: "list_story_bible", args: { projectId: "project-1" } },
    { command: "save_story_bible", args: { input: { projectId: "project-1", kind: "synopsis", value: { summary: "手工修订" } } } },
    { command: "search_source_segments", args: { projectId: "project-1", query: "雾港", limit: 5 } },
    { command: "save_source_analysis", args: { input: { projectId: "project-1", sourceDocumentId: "source-1", chapterId: "chapter-1", value: { summary: "摘要" } } } },
    { command: "list_source_analysis", args: { sourceDocumentId: "source-1" } },
    { command: "set_source_analysis_status", args: { analysisId: "analysis-1", status: "accepted" } },
    { command: "create_ai_task", args: { input: { id: "task-1", projectId: "project-1", kind: "source.analyze", providerId: "anthropic", model: "writer", idempotencyKey: "source-1:v1", inputHash: "hash-1", input: { sourceDocumentId: "source-1" } } } },
    { command: "update_ai_task", args: { input: { taskId: "task-1", expectedRevision: 0, status: "running" } } },
    { command: "list_ai_tasks", args: { projectId: "project-1" } },
    { command: "save_chapter_draft", args: { input: { projectId: "project-1", chapterPlanId: "chapter-plan-1", title: "第一章", content: "正文", source: "manual", expectedRevision: 0 } } },
    { command: "list_chapter_drafts", args: { projectId: "project-1" } },
    { command: "list_chapter_versions", args: { chapterDocumentId: "draft-1" } },
    { command: "set_chapter_status", args: { chapterDocumentId: "draft-1", status: "final" } },
    { command: "create_context_snapshot", args: { input: { id: "snapshot-1", projectId: "project-1", scopeKind: "chapter_generation", scopeId: "chapter-plan-1", visibleThroughOrdinal: 1, payload: { sources: [] } } } },
    { command: "list_context_snapshots", args: { projectId: "project-1", scopeId: "chapter-plan-1" } },
    { command: "save_consistency_report", args: { input: { projectId: "project-1", chapterPlanId: "chapter-plan-1", chapterDocumentRevision: 1, report: { issues: [] } } } },
    { command: "list_consistency_reports", args: { projectId: "project-1", chapterPlanId: "chapter-plan-1" } },
  ]);
});
